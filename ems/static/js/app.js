/* ═══════════════════════════════════════
   EMS — Employee Management System JS
═══════════════════════════════════════ */

// ── STATE ────────────────────────────
let S = { user: null, employees: [], departments: [], roles: [] };

// ── API ──────────────────────────────
async function api(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Error");
  return d;
}
const GET    = u     => api(u);
const POST   = (u,b) => api(u, { method:"POST",   body:b });
const PUT    = (u,b) => api(u, { method:"PUT",    body:b });
const DEL    = u     => api(u, { method:"DELETE" });

// ── TOAST ────────────────────────────
let _tt;
function toast(msg, type="info") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = `toast ${type}`;
  t.classList.remove("hidden");
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.add("hidden"), 3000);
}

// ── AUTH ─────────────────────────────
async function doLogin() {
  const u = document.getElementById("li-user").value.trim();
  const p = document.getElementById("li-pw").value;
  const e = document.getElementById("li-err");
  e.classList.add("hidden");
  if (!u || !p) { e.textContent = "Enter username and password"; e.classList.remove("hidden"); return; }
  try {
    const user = await POST("/api/login", { username: u, password: p });
    S.user = user;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("tb-user-name").textContent = user.name;
    document.getElementById("dash-date").textContent = new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
    await loadAll();
    go("dashboard");
  } catch(err) { e.textContent = err.message; e.classList.remove("hidden"); }
}

async function doLogout() {
  await POST("/api/logout");
  S.user = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").style.display = "";
  document.getElementById("li-pw").value = "";
}

// Enter key login
document.addEventListener("DOMContentLoaded", () => {
  ["li-user","li-pw"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => { if(e.key==="Enter") doLogin(); });
  });
  document.getElementById("add-emp-btn").onclick  = openAddEmployee;
  document.getElementById("add-dept-btn").onclick = openAddDept;
  document.getElementById("add-role-btn").onclick = openAddRole;
  // Check existing session
  GET("/api/me").then(u => {
    S.user = u;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("tb-user-name").textContent = u.name;
    document.getElementById("dash-date").textContent = new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
    loadAll().then(() => go("dashboard"));
  }).catch(() => {});
  document.addEventListener("keydown", e => { if(e.key==="Escape") closeModal(); });
});

// ── LOAD ALL ─────────────────────────
async function loadAll() {
  [S.employees, S.departments, S.roles] = await Promise.all([
    GET("/api/employees"), GET("/api/departments"), GET("/api/roles")
  ]);
}

// ── NAV ──────────────────────────────
function go(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");
  document.querySelector(`[data-page="${page}"]`).classList.add("active");
  closeSidebar();
  if(page==="dashboard")   loadDashboard();
  if(page==="employees")   renderEmployees();
  if(page==="departments") renderDepartments();
  if(page==="roles")       renderRoles();
  if(page==="audit")       loadAudit();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
}

// ── DASHBOARD ────────────────────────
async function loadDashboard() {
  const d = await GET("/api/dashboard");
  const stats = [
    { label:"Total Employees", value:d.totalEmployees,  sub:"registered employees", icon:"<svg viewBox='0 0 24 24'><circle cx='9' cy='7' r='4'/><path d='M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/><path d='M21 21v-2a4 4 0 0 0-3-3.87'/></svg>", cls:"si-blue" },
    { label:"Active",           value:d.activeEmployees, sub:"currently active",      icon:"<svg viewBox='0 0 24 24'><polyline points='20 6 9 17 4 12'/></svg>", cls:"si-green" },
    { label:"Inactive",         value:d.inactiveEmployees,sub:"disabled accounts",    icon:"<svg viewBox='0 0 24 24'><circle cx='12' cy='12' r='10'/><line x1='4.93' y1='4.93' x2='19.07' y2='19.07'/></svg>", cls:"si-red" },
    { label:"New This Month",   value:d.newThisMonth,   sub:"joined recently",        icon:"<svg viewBox='0 0 24 24'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>", cls:"si-purple" },
  ];
  document.getElementById("stat-row").innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon ${s.cls}">${s.icon}</div>
      <div class="stat-info">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    </div>
  `).join("");

  const maxD = Math.max(...d.deptDistribution.map(r=>r.c), 1);
  document.getElementById("dept-dist").innerHTML = d.deptDistribution.map(r => `
    <div class="dist-row">
      <div class="dist-name">${r.name}</div>
      <div class="dist-bar-bg"><div class="dist-bar-fill" style="width:${Math.max(r.c/maxD*100,2)}%"></div></div>
      <div class="dist-num">${r.c}</div>
    </div>
  `).join("") || '<div style="padding:20px;color:var(--text3);text-align:center">No data</div>';

  const maxR = Math.max(...d.roleDistribution.map(r=>r.c), 1);
  document.getElementById("role-dist").innerHTML = d.roleDistribution.map(r => `
    <div class="dist-row">
      <div class="dist-name">${r.name}</div>
      <div class="dist-bar-bg"><div class="dist-bar-fill" style="width:${Math.max(r.c/maxR*100,2)}%;background:linear-gradient(90deg,#8b5cf6,#06b6d4)"></div></div>
      <div class="dist-num">${r.c}</div>
    </div>
  `).join("") || '<div style="padding:20px;color:var(--text3);text-align:center">No data</div>';

  const dotClass = { CREATE:"ad-green", DELETE:"ad-red", UPDATE:"ad-blue", LOGIN:"ad-orange", LOGOUT:"" };
  document.getElementById("recent-act").innerHTML = d.recentActivity.map(l => `
    <div class="act-row">
      <div class="act-dot ${dotClass[l.action]||"ad-blue"}"></div>
      <div>
        <div class="act-main"><strong>${l.uname||"System"}</strong> ${l.action.toLowerCase()}d <em>${l.entity}</em>${l.details ? ` — ${l.details}` : ""}</div>
        <div class="act-time">${fmtDate(l.timestamp)}</div>
      </div>
    </div>
  `).join("") || '<div style="padding:20px;color:var(--text3);text-align:center">No activity</div>';
}

// ── EMPLOYEES ────────────────────────
const avatarColors = ["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#0284c7","#16a34a"];
function avatarColor(name) { let h=0; for(let c of name) h=c.charCodeAt(0)+((h<<5)-h); return avatarColors[Math.abs(h)%avatarColors.length]; }
function initials(fn,ln) { return ((fn||"?")[0]+(ln||"?")[0]).toUpperCase(); }

function renderEmployees(list) {
  const emps = list || S.employees;
  const grid = document.getElementById("emp-grid");
  if(!emps.length) { grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3)">No employees found</div>'; return; }
  grid.innerHTML = emps.map(e => `
    <div class="emp-card">
      <div class="emp-card-top">
        <div class="emp-avatar" style="background:${avatarColor(e.firstName)}">${initials(e.firstName,e.lastName)}</div>
        <div>
          <div class="emp-name">${e.fullName}</div>
          <div class="emp-role">${e.roleName} · ${e.deptName}</div>
        </div>
      </div>
      <div class="emp-card-body">
        <div class="emp-info-row">
          <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          ${e.email}
        </div>
        <div class="emp-info-row">
          <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.61 4.9 2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17z"/></svg>
          ${e.mobile || "—"}
        </div>
        <div class="emp-info-row">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Joined: ${e.dateOfJoining || "—"}
        </div>
        ${e.managerName !== "—" ? `<div class="emp-info-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>Reports to: ${e.managerName}</div>` : ""}
      </div>
      <div class="emp-card-foot">
        <span class="emp-status ${e.isActive?'es-active':'es-inactive'}">${e.isActive?"● Active":"○ Inactive"}</span>
        <div class="emp-actions">
          <button class="ic-btn" title="View" onclick="viewEmployee(${e.id})">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="ic-btn" title="Edit" onclick="editEmployee(${e.id})">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="ic-btn del" title="Delete" onclick="deleteEmployee(${e.id},'${e.fullName}')">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

function filterEmp(q) {
  const lq = q.toLowerCase();
  renderEmployees(q ? S.employees.filter(e =>
    `${e.fullName} ${e.email} ${e.deptName} ${e.roleName} ${e.mobile||""} ${e.username}`.toLowerCase().includes(lq)
  ) : S.employees);
}

function viewEmployee(id) {
  const e = S.employees.find(x=>x.id===id); if(!e) return;
  document.getElementById("view-body").innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar" style="background:${avatarColor(e.firstName)}">${initials(e.firstName,e.lastName)}</div>
      <div>
        <div class="profile-name">${e.fullName}</div>
        <div class="profile-role">${e.roleName} · ${e.deptName}</div>
        <div class="profile-badges">
          <span class="pbadge ${e.isActive?'pb-active':'pb-inactive'}">${e.isActive?"Active":"Inactive"}</span>
          ${e.isAdmin?'<span class="pbadge pb-admin">Admin</span>':""}
        </div>
      </div>
    </div>
    <div class="profile-grid">
      <div class="pf-field"><div class="pf-label">Employee ID</div><div class="pf-val">#${e.id}</div></div>
      <div class="pf-field"><div class="pf-label">Username</div><div class="pf-val">@${e.username}</div></div>
      <div class="pf-field"><div class="pf-label">Email</div><div class="pf-val">${e.email}</div></div>
      <div class="pf-field"><div class="pf-label">Mobile</div><div class="pf-val">${e.mobile||"—"}</div></div>
      <div class="pf-field"><div class="pf-label">Department</div><div class="pf-val">${e.deptName}</div></div>
      <div class="pf-field"><div class="pf-label">Role</div><div class="pf-val">${e.roleName}</div></div>
      <div class="pf-field"><div class="pf-label">Reporting Manager</div><div class="pf-val">${e.managerName}</div></div>
      <div class="pf-field"><div class="pf-label">Date of Joining</div><div class="pf-val">${e.dateOfJoining||"—"}</div></div>
      <div class="pf-field"><div class="pf-label">Created At</div><div class="pf-val">${fmtDate(e.createdAt)}</div></div>
      <div class="pf-field"><div class="pf-label">Last Updated</div><div class="pf-val">${fmtDate(e.updatedAt)}</div></div>
    </div>
  `;
  openModal("view-modal");
}

function populateEmpForm() {
  const ds = document.getElementById("em-dept");
  const rs = document.getElementById("em-role");
  const ms = document.getElementById("em-mgr");
  ds.innerHTML = '<option value="">— Select Department —</option>' + S.departments.map(d=>`<option value="${d.id}">${d.name}</option>`).join("");
  rs.innerHTML = '<option value="">— Select Role —</option>'       + S.roles.map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
  ms.innerHTML = '<option value="">— Select Manager —</option>'    + S.employees.map(e=>`<option value="${e.id}">${e.fullName}</option>`).join("");
}

function openAddEmployee() {
  document.getElementById("emp-modal").querySelector("h3").textContent = "Add Employee";
  ["em-id","em-fn","em-ln","em-un","em-pw","em-email","em-mob"].forEach(i => document.getElementById(i).value="");
  document.getElementById("em-active").checked = true;
  document.getElementById("em-admin").checked  = false;
  document.getElementById("em-pw-hint").classList.add("hidden");
  document.getElementById("em-err").classList.add("hidden");
  document.getElementById("em-doj").value = new Date().toISOString().split("T")[0];
  populateEmpForm();
  openModal("emp-modal");
}

function editEmployee(id) {
  const e = S.employees.find(x=>x.id===id); if(!e) return;
  document.getElementById("emp-modal").querySelector("h3").textContent = "Edit Employee";
  document.getElementById("em-id").value    = e.id;
  document.getElementById("em-fn").value    = e.firstName;
  document.getElementById("em-ln").value    = e.lastName;
  document.getElementById("em-un").value    = e.username;
  document.getElementById("em-pw").value    = "";
  document.getElementById("em-email").value = e.email;
  document.getElementById("em-mob").value   = e.mobile || "";
  document.getElementById("em-doj").value   = e.dateOfJoining || "";
  document.getElementById("em-active").checked = e.isActive;
  document.getElementById("em-admin").checked  = e.isAdmin;
  document.getElementById("em-pw-hint").classList.remove("hidden");
  document.getElementById("em-err").classList.add("hidden");
  populateEmpForm();
  document.getElementById("em-dept").value = e.deptId || "";
  document.getElementById("em-role").value = e.roleId || "";
  document.getElementById("em-mgr").value  = e.managerId || "";
  openModal("emp-modal");
}

async function saveEmployee() {
  const id  = document.getElementById("em-id").value;
  const err = document.getElementById("em-err");
  err.classList.add("hidden");
  const payload = {
    firstName: document.getElementById("em-fn").value.trim(),
    lastName:  document.getElementById("em-ln").value.trim(),
    username:  document.getElementById("em-un").value.trim(),
    password:  document.getElementById("em-pw").value,
    email:     document.getElementById("em-email").value.trim(),
    mobile:    document.getElementById("em-mob").value.trim(),
    deptId:    document.getElementById("em-dept").value || null,
    roleId:    document.getElementById("em-role").value || null,
    managerId: document.getElementById("em-mgr").value  || null,
    dateOfJoining: document.getElementById("em-doj").value,
    isActive:  document.getElementById("em-active").checked,
    isAdmin:   document.getElementById("em-admin").checked,
  };
  if(!payload.firstName||!payload.lastName||!payload.username||!payload.email){err.textContent="First name, last name, username & email are required";err.classList.remove("hidden");return;}
  if(!id && !payload.password){err.textContent="Password is required for new employees";err.classList.remove("hidden");return;}
  try {
    if(id){ await PUT(`/api/employees/${id}`,payload); toast("Employee updated","success"); }
    else  { await POST("/api/employees",payload);       toast("Employee added","success"); }
    closeModal();
    S.employees = await GET("/api/employees");
    renderEmployees();
  } catch(e){err.textContent=e.message;err.classList.remove("hidden");}
}

async function deleteEmployee(id, name) {
  if(!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await DEL(`/api/employees/${id}`);
    toast("Employee deleted","info");
    S.employees = await GET("/api/employees");
    renderEmployees();
  } catch(e){ toast(e.message,"error"); }
}

// ── DEPARTMENTS ──────────────────────
function renderDepartments() {
  document.getElementById("dept-grid").innerHTML = S.departments.map(d => `
    <div class="dept-card">
      <div class="dept-icon">
        <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div class="dept-name">${d.name}</div>
      <div class="dept-desc">${d.description||"No description"}</div>
      <div class="dept-count">👥 ${d.emp_count} employee${d.emp_count!==1?"s":""}</div>
      <div class="dept-foot">
        <button class="btn-ghost" style="padding:6px 12px;font-size:12px" onclick="editDept(${d.id})">Edit</button>
        <button class="btn-ghost" style="padding:6px 12px;font-size:12px;color:var(--red);border-color:var(--red)" onclick="deleteDept(${d.id},'${d.name}')">Delete</button>
      </div>
    </div>
  `).join("") || '<div style="padding:40px;text-align:center;color:var(--text3)">No departments found</div>';
}

function openAddDept() {
  document.getElementById("dept-modal").querySelector("h3").textContent = "Add Department";
  document.getElementById("dm-id").value = "";
  document.getElementById("dm-name").value = "";
  document.getElementById("dm-desc").value = "";
  document.getElementById("dm-err").classList.add("hidden");
  openModal("dept-modal");
}

function editDept(id) {
  const d = S.departments.find(x=>x.id===id); if(!d) return;
  document.getElementById("dept-modal").querySelector("h3").textContent = "Edit Department";
  document.getElementById("dm-id").value   = d.id;
  document.getElementById("dm-name").value = d.name;
  document.getElementById("dm-desc").value = d.description||"";
  document.getElementById("dm-err").classList.add("hidden");
  openModal("dept-modal");
}

async function saveDept() {
  const id  = document.getElementById("dm-id").value;
  const err = document.getElementById("dm-err");
  const payload = { name:document.getElementById("dm-name").value.trim(), description:document.getElementById("dm-desc").value.trim() };
  if(!payload.name){err.textContent="Name required";err.classList.remove("hidden");return;}
  try {
    if(id){ await PUT(`/api/departments/${id}`,payload); toast("Department updated","success"); }
    else  { await POST("/api/departments",payload);       toast("Department created","success"); }
    closeModal();
    S.departments = await GET("/api/departments");
    renderDepartments();
  } catch(e){err.textContent=e.message;err.classList.remove("hidden");}
}

async function deleteDept(id, name) {
  if(!confirm(`Delete "${name}"?`)) return;
  try {
    await DEL(`/api/departments/${id}`);
    toast("Deleted","info");
    S.departments = await GET("/api/departments");
    renderDepartments();
  } catch(e){ toast(e.message,"error"); }
}

// ── ROLES ────────────────────────────
function renderRoles() {
  document.getElementById("roles-list").innerHTML = S.roles.map(r => `
    <div class="role-row">
      <div class="role-dot"></div>
      <div class="role-info">
        <div class="role-name">${r.name}</div>
        <div class="role-desc">${r.description||"No description"}</div>
      </div>
      <div class="role-count">${r.emp_count} employee${r.emp_count!==1?"s":""}</div>
      <button class="btn-ghost" style="padding:6px 12px;font-size:12px" onclick="editRole(${r.id})">Edit</button>
      <button class="btn-ghost" style="padding:6px 12px;font-size:12px;color:var(--red);border-color:var(--red)" onclick="deleteRole(${r.id},'${r.name}')">Delete</button>
    </div>
  `).join("") || '<div style="padding:40px;text-align:center;color:var(--text3)">No roles found</div>';
}

function openAddRole() {
  document.getElementById("role-modal").querySelector("h3").textContent = "Add Role";
  document.getElementById("rm-id").value = "";
  document.getElementById("rm-name").value = "";
  document.getElementById("rm-desc").value = "";
  document.getElementById("rm-err").classList.add("hidden");
  openModal("role-modal");
}

function editRole(id) {
  const r = S.roles.find(x=>x.id===id); if(!r) return;
  document.getElementById("role-modal").querySelector("h3").textContent = "Edit Role";
  document.getElementById("rm-id").value   = r.id;
  document.getElementById("rm-name").value = r.name;
  document.getElementById("rm-desc").value = r.description||"";
  document.getElementById("rm-err").classList.add("hidden");
  openModal("role-modal");
}

async function saveRole() {
  const id  = document.getElementById("rm-id").value;
  const err = document.getElementById("rm-err");
  const payload = { name:document.getElementById("rm-name").value.trim(), description:document.getElementById("rm-desc").value.trim() };
  if(!payload.name){err.textContent="Name required";err.classList.remove("hidden");return;}
  try {
    if(id){ await PUT(`/api/roles/${id}`,payload); toast("Role updated","success"); }
    else  { await POST("/api/roles",payload);       toast("Role created","success"); }
    closeModal();
    S.roles = await GET("/api/roles");
    renderRoles();
  } catch(e){err.textContent=e.message;err.classList.remove("hidden");}
}

async function deleteRole(id, name) {
  if(!confirm(`Delete role "${name}"?`)) return;
  try {
    await DEL(`/api/roles/${id}`);
    toast("Deleted","info");
    S.roles = await GET("/api/roles");
    renderRoles();
  } catch(e){ toast(e.message,"error"); }
}

// ── AUDIT ────────────────────────────
async function loadAudit() {
  const logs = await GET("/api/audit");
  document.getElementById("audit-body").innerHTML = logs.map(l => `
    <tr>
      <td style="white-space:nowrap;color:var(--text3);font-size:12px">${fmtDate(l.timestamp)}</td>
      <td><strong>${l.uname||"System"}</strong></td>
      <td><span class="a-badge ab-${l.action}">${l.action}</span></td>
      <td style="color:var(--text2)">${l.entity}${l.entity_id?` #${l.entity_id}`:""}</td>
      <td style="color:var(--text3);font-size:12px">${l.details||"—"}</td>
    </tr>
  `).join("") || '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text3)">No logs found</td></tr>';
}

// ── MODAL HELPERS ────────────────────
function openModal(id) {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}
function closeModal() {
  document.getElementById("overlay").classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}

// ── UTILS ────────────────────────────
function fmtDate(s) {
  if(!s) return "—";
  return new Date(s.replace(" ","T")+(s.includes("T")?"":"Z")).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
