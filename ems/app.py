from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
import sqlite3, hashlib, secrets, os
from datetime import datetime

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
CORS(app)
DB = os.path.join(os.path.dirname(__file__), "ems.db")

# ─────────────────────────────────────
#  DATABASE
# ─────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_pw(pw): return hashlib.sha256(pw.encode()).hexdigest()

def init_db():
    conn = get_db(); c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS departments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS roles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS employees (
        employee_id          INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name           TEXT NOT NULL,
        last_name            TEXT NOT NULL,
        username             TEXT UNIQUE NOT NULL,
        password             TEXT NOT NULL,
        email                TEXT UNIQUE NOT NULL,
        mobile               TEXT,
        dept_id              INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        role_id              INTEGER REFERENCES roles(id) ON DELETE SET NULL,
        reporting_manager_id INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
        date_of_joining      TEXT,
        is_active            INTEGER DEFAULT 1,
        is_admin             INTEGER DEFAULT 0,
        created_at           TEXT DEFAULT (datetime('now')),
        updated_at           TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER,
        action     TEXT NOT NULL,
        entity     TEXT NOT NULL,
        entity_id  INTEGER,
        details    TEXT,
        timestamp  TEXT DEFAULT (datetime('now'))
    );
    """)
    # Seed departments
    depts = [("Engineering","Software & Tech"),("Human Resources","HR & Recruitment"),
             ("Finance","Accounts & Finance"),("Marketing","Marketing & Sales"),
             ("Operations","Operations & Logistics"),("Design","UI/UX & Design")]
    for n,d in depts:
        c.execute("INSERT OR IGNORE INTO departments(name,description) VALUES(?,?)",(n,d))
    # Seed roles
    roles = [("Software Engineer","Dev role"),("Senior Engineer","Senior Dev"),
             ("Team Lead","Lead a team"),("Manager","Manage a department"),
             ("HR Executive","HR tasks"),("Finance Analyst","Finance tasks"),
             ("Designer","Design tasks"),("Intern","Internship role")]
    for n,d in roles:
        c.execute("INSERT OR IGNORE INTO roles(name,description) VALUES(?,?)",(n,d))
    # Admin
    c.execute("INSERT OR IGNORE INTO employees(first_name,last_name,username,password,email,mobile,is_admin,date_of_joining) VALUES(?,?,?,?,?,?,?,?)",
              ("System","Admin","admin",hash_pw("admin123"),"admin@ems.com","9999999999",1,"2024-01-01"))
    # Sample employees
    samples = [
        ("Rahul","Sharma","rahul.sharma","pass123","rahul@ems.com","9876543210",1,1,None,"2024-02-15"),
        ("Priya","Patel","priya.patel","pass123","priya@ems.com","9876543211",2,5,None,"2024-03-01"),
        ("Amit","Desai","amit.desai","pass123","amit@ems.com","9876543212",3,2,None,"2024-03-10"),
        ("Sneha","Joshi","sneha.joshi","pass123","sneha@ems.com","9876543213",4,4,None,"2024-04-01"),
        ("Vikram","Nair","vikram.nair","pass123","vikram@ems.com","9876543214",1,3,None,"2024-04-15"),
        ("Pooja","Singh","pooja.singh","pass123","pooja@ems.com","9876543215",2,1,None,"2024-05-01"),
    ]
    for fn,ln,un,pw,em,mob,di,ri,mi,doj in samples:
        c.execute("INSERT OR IGNORE INTO employees(first_name,last_name,username,password,email,mobile,dept_id,role_id,reporting_manager_id,date_of_joining) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (fn,ln,un,hash_pw(pw),em,mob,di,ri,mi,doj))
    conn.commit(); conn.close()

def log_action(uid, action, entity, eid=None, details=None):
    conn = get_db()
    conn.execute("INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)",(uid,action,entity,eid,details))
    conn.commit(); conn.close()

# ─────────────────────────────────────
#  AUTH DECORATOR
# ─────────────────────────────────────
def auth_required(f):
    from functools import wraps
    @wraps(f)
    def wrap(*a,**kw):
        if "uid" not in session: return jsonify({"error":"Unauthorized"}),401
        return f(*a,**kw)
    return wrap

# ─────────────────────────────────────
#  FRONTEND
# ─────────────────────────────────────
@app.route("/")
def index(): return render_template("index.html")

# ─────────────────────────────────────
#  AUTH
# ─────────────────────────────────────
@app.route("/api/login", methods=["POST"])
def login():
    d = request.json
    conn = get_db()
    u = conn.execute("SELECT * FROM employees WHERE (username=? OR email=?) AND password=? AND is_active=1",
                     (d["username"],d["username"],hash_pw(d["password"]))).fetchone()
    conn.close()
    if not u: return jsonify({"error":"Invalid credentials"}),401
    session["uid"] = u["employee_id"]; session["uname"] = u["username"]; session["is_admin"] = u["is_admin"]
    log_action(u["employee_id"],"LOGIN","employees",u["employee_id"])
    return jsonify({"id":u["employee_id"],"name":f"{u['first_name']} {u['last_name']}","username":u["username"],"isAdmin":bool(u["is_admin"])})

@app.route("/api/logout", methods=["POST"])
def logout():
    uid = session.get("uid"); session.clear()
    if uid: log_action(uid,"LOGOUT","employees",uid)
    return jsonify({"ok":True})

@app.route("/api/me")
@auth_required
def me():
    conn = get_db()
    u = conn.execute("SELECT * FROM employees WHERE employee_id=?",(session["uid"],)).fetchone()
    conn.close()
    if not u: return jsonify({"error":"Not found"}),404
    return jsonify({"id":u["employee_id"],"name":f"{u['first_name']} {u['last_name']}","username":u["username"],"isAdmin":bool(u["is_admin"])})

# ─────────────────────────────────────
#  EMPLOYEES
# ─────────────────────────────────────
def emp_row(e, conn):
    dept = conn.execute("SELECT name FROM departments WHERE id=?",(e["dept_id"],)).fetchone() if e["dept_id"] else None
    role = conn.execute("SELECT name FROM roles WHERE id=?",(e["role_id"],)).fetchone() if e["role_id"] else None
    mgr  = conn.execute("SELECT first_name,last_name FROM employees WHERE employee_id=?",(e["reporting_manager_id"],)).fetchone() if e["reporting_manager_id"] else None
    return {
        "id": e["employee_id"], "firstName": e["first_name"], "lastName": e["last_name"],
        "fullName": f"{e['first_name']} {e['last_name']}", "username": e["username"],
        "email": e["email"], "mobile": e["mobile"] or "",
        "deptId": e["dept_id"], "deptName": dept["name"] if dept else "—",
        "roleId": e["role_id"], "roleName": role["name"] if role else "—",
        "managerId": e["reporting_manager_id"],
        "managerName": f"{mgr['first_name']} {mgr['last_name']}" if mgr else "—",
        "dateOfJoining": e["date_of_joining"] or "", "isActive": bool(e["is_active"]),
        "isAdmin": bool(e["is_admin"]), "createdAt": e["created_at"], "updatedAt": e["updated_at"]
    }

@app.route("/api/employees")
@auth_required
def get_employees():
    conn = get_db()
    rows = conn.execute("SELECT * FROM employees ORDER BY employee_id").fetchall()
    result = [emp_row(r,conn) for r in rows]
    conn.close(); return jsonify(result)

@app.route("/api/employees/<int:eid>")
@auth_required
def get_employee(eid):
    conn = get_db()
    e = conn.execute("SELECT * FROM employees WHERE employee_id=?",(eid,)).fetchone()
    conn.close()
    if not e: return jsonify({"error":"Not found"}),404
    conn = get_db(); r = emp_row(e,conn); conn.close(); return jsonify(r)

@app.route("/api/employees", methods=["POST"])
@auth_required
def create_employee():
    d = request.json
    if not all([d.get("firstName"),d.get("lastName"),d.get("username"),d.get("email"),d.get("password")]):
        return jsonify({"error":"firstName, lastName, username, email, password required"}),400
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO employees(first_name,last_name,username,password,email,mobile,dept_id,role_id,reporting_manager_id,date_of_joining,is_active,is_admin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (d["firstName"],d["lastName"],d["username"],hash_pw(d["password"]),d["email"],
             d.get("mobile",""),d.get("deptId") or None,d.get("roleId") or None,
             d.get("managerId") or None,d.get("dateOfJoining",""),
             int(d.get("isActive",True)),int(d.get("isAdmin",False))))
        conn.commit(); nid = cur.lastrowid
        log_action(session["uid"],"CREATE","employees",nid,f"Created {d['firstName']} {d['lastName']}")
        conn.close(); return jsonify({"id":nid,"message":"Employee created"}),201
    except sqlite3.IntegrityError as e:
        conn.close(); return jsonify({"error":str(e)}),409

@app.route("/api/employees/<int:eid>", methods=["PUT"])
@auth_required
def update_employee(eid):
    d = request.json; conn = get_db()
    e = conn.execute("SELECT * FROM employees WHERE employee_id=?",(eid,)).fetchone()
    if not e: conn.close(); return jsonify({"error":"Not found"}),404
    conn.execute("""UPDATE employees SET first_name=?,last_name=?,username=?,email=?,mobile=?,
        dept_id=?,role_id=?,reporting_manager_id=?,date_of_joining=?,is_active=?,is_admin=?,
        updated_at=datetime('now') WHERE employee_id=?""",
        (d.get("firstName",e["first_name"]),d.get("lastName",e["last_name"]),
         d.get("username",e["username"]),d.get("email",e["email"]),
         d.get("mobile",e["mobile"]),d.get("deptId") or None,d.get("roleId") or None,
         d.get("managerId") or None,d.get("dateOfJoining",e["date_of_joining"]),
         int(d.get("isActive",e["is_active"])),int(d.get("isAdmin",e["is_admin"])),eid))
    if d.get("password"):
        conn.execute("UPDATE employees SET password=? WHERE employee_id=?",(hash_pw(d["password"]),eid))
    conn.commit()
    log_action(session["uid"],"UPDATE","employees",eid,f"Updated employee {eid}")
    conn.close(); return jsonify({"message":"Updated"})

@app.route("/api/employees/<int:eid>", methods=["DELETE"])
@auth_required
def delete_employee(eid):
    if eid == session["uid"]: return jsonify({"error":"Cannot delete yourself"}),400
    conn = get_db()
    conn.execute("DELETE FROM employees WHERE employee_id=?",(eid,))
    conn.commit()
    log_action(session["uid"],"DELETE","employees",eid)
    conn.close(); return jsonify({"message":"Deleted"})

# ─────────────────────────────────────
#  DEPARTMENTS
# ─────────────────────────────────────
@app.route("/api/departments")
@auth_required
def get_departments():
    conn = get_db()
    rows = conn.execute("SELECT d.*, COUNT(e.employee_id) as emp_count FROM departments d LEFT JOIN employees e ON d.id=e.dept_id GROUP BY d.id").fetchall()
    conn.close(); return jsonify([dict(r) for r in rows])

@app.route("/api/departments", methods=["POST"])
@auth_required
def create_department():
    d = request.json; conn = get_db()
    try:
        cur = conn.execute("INSERT INTO departments(name,description) VALUES(?,?)",(d["name"],d.get("description","")))
        conn.commit()
        log_action(session["uid"],"CREATE","departments",cur.lastrowid,f"Created dept {d['name']}")
        conn.close(); return jsonify({"id":cur.lastrowid,"message":"Created"}),201
    except sqlite3.IntegrityError as e:
        conn.close(); return jsonify({"error":str(e)}),409

@app.route("/api/departments/<int:did>", methods=["PUT"])
@auth_required
def update_department(did):
    d = request.json; conn = get_db()
    conn.execute("UPDATE departments SET name=?,description=? WHERE id=?",(d["name"],d.get("description",""),did))
    conn.commit(); conn.close(); return jsonify({"message":"Updated"})

@app.route("/api/departments/<int:did>", methods=["DELETE"])
@auth_required
def delete_department(did):
    conn = get_db()
    conn.execute("DELETE FROM departments WHERE id=?",(did,))
    conn.commit(); conn.close(); return jsonify({"message":"Deleted"})

# ─────────────────────────────────────
#  ROLES
# ─────────────────────────────────────
@app.route("/api/roles")
@auth_required
def get_roles():
    conn = get_db()
    rows = conn.execute("SELECT r.*, COUNT(e.employee_id) as emp_count FROM roles r LEFT JOIN employees e ON r.id=e.role_id GROUP BY r.id").fetchall()
    conn.close(); return jsonify([dict(r) for r in rows])

@app.route("/api/roles", methods=["POST"])
@auth_required
def create_role():
    d = request.json; conn = get_db()
    try:
        cur = conn.execute("INSERT INTO roles(name,description) VALUES(?,?)",(d["name"],d.get("description","")))
        conn.commit(); conn.close(); return jsonify({"id":cur.lastrowid,"message":"Created"}),201
    except sqlite3.IntegrityError as e:
        conn.close(); return jsonify({"error":str(e)}),409

@app.route("/api/roles/<int:rid>", methods=["PUT"])
@auth_required
def update_role(rid):
    d = request.json; conn = get_db()
    conn.execute("UPDATE roles SET name=?,description=? WHERE id=?",(d["name"],d.get("description",""),rid))
    conn.commit(); conn.close(); return jsonify({"message":"Updated"})

@app.route("/api/roles/<int:rid>", methods=["DELETE"])
@auth_required
def delete_role(rid):
    conn = get_db()
    conn.execute("DELETE FROM roles WHERE id=?",(rid,))
    conn.commit(); conn.close(); return jsonify({"message":"Deleted"})

# ─────────────────────────────────────
#  DASHBOARD
# ─────────────────────────────────────
@app.route("/api/dashboard")
@auth_required
def dashboard():
    conn = get_db()
    total    = conn.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    active   = conn.execute("SELECT COUNT(*) FROM employees WHERE is_active=1").fetchone()[0]
    inactive = total - active
    new_this_month = conn.execute("SELECT COUNT(*) FROM employees WHERE strftime('%Y-%m',date_of_joining)=strftime('%Y-%m','now')").fetchone()[0]
    depts    = conn.execute("SELECT d.name, COUNT(e.employee_id) as c FROM departments d LEFT JOIN employees e ON d.id=e.dept_id GROUP BY d.id ORDER BY c DESC").fetchall()
    roles    = conn.execute("SELECT r.name, COUNT(e.employee_id) as c FROM roles r LEFT JOIN employees e ON r.id=e.role_id GROUP BY r.id ORDER BY c DESC LIMIT 6").fetchall()
    recent   = conn.execute("SELECT al.*,e.first_name||' '||e.last_name as uname FROM audit_log al LEFT JOIN employees e ON al.user_id=e.employee_id ORDER BY al.timestamp DESC LIMIT 10").fetchall()
    conn.close()
    return jsonify({
        "totalEmployees": total, "activeEmployees": active,
        "inactiveEmployees": inactive, "newThisMonth": new_this_month,
        "deptDistribution": [dict(r) for r in depts],
        "roleDistribution": [dict(r) for r in roles],
        "recentActivity": [dict(r) for r in recent]
    })

# ─────────────────────────────────────
#  AUDIT
# ─────────────────────────────────────
@app.route("/api/audit")
@auth_required
def get_audit():
    conn = get_db()
    logs = conn.execute("SELECT al.*,e.first_name||' '||e.last_name as uname FROM audit_log al LEFT JOIN employees e ON al.user_id=e.employee_id ORDER BY al.timestamp DESC LIMIT 200").fetchall()
    conn.close(); return jsonify([dict(r) for r in logs])

# ─────────────────────────────────────
#  MAIN
# ─────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print("✅ Database ready   |  Login: admin / admin123")
    app.run(debug=True, host="0.0.0.0", port=5000)
