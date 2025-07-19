import { API_BASE_URL } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('user_role');
    const token = localStorage.getItem('access_token');
    
    if (role !== 'admin' || !token) {
        window.location.href = 'index.html';
        return;
    }

    // --- Toast Notification Setup ---
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    function showToast(icon, title) {
        Toast.fire({ icon, title });
    }

    const sidebarNav = document.getElementById('sidebar-nav');
    const views = {
        solutions: document.getElementById('view-solutions'),
        subjects: document.getElementById('view-subjects'),
        users: document.getElementById('view-users'),
        logs: document.getElementById('view-logs')
    };

    const api = {
        _call: (endpoint, method = 'GET', body = null) => {
            const token = localStorage.getItem('access_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const config = { method, headers };
            if (body) {
                config.body = JSON.stringify(body);
            }
            return fetch(`${API_BASE_URL}/api/${endpoint}`, config).then(async res => {
                if (res.status === 401) {
                    localStorage.clear();
                    window.location.href = 'index.html';
                    return Promise.reject(new Error('Token ไม่ถูกต้องหรือไม่ได้รับอนุญาต'));
                }
                if (!res.ok) {
                    const error = await res.json().catch(() => ({ message: 'เกิดข้อผิดพลาด' }));
                    throw new Error(error.message);
                }
                if (res.status === 204 || res.headers.get("content-length") === "0") {
                    return Promise.resolve({});
                }
                return res.json();
            });
        },
        get: (e) => api._call(e),
        post: (e, d) => api._call(e, 'POST', d),
        put: (e, i, d) => api._call(`${e}/${i}`, 'PUT', d),
        delete: (e, i) => api._call(`${e}/${i}`, 'DELETE'),
    };

    // --- VIEW SWITCHING ---
    sidebarNav.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        e.preventDefault();
        const viewName = link.parentElement.dataset.view;
        if (!viewName || !views[viewName]) return;
        Object.values(views).forEach(v => v.style.display = 'none');
        views[viewName].style.display = 'block';
        sidebarNav.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        link.parentElement.classList.add('active');
        if (viewName === 'solutions') renderSolutionsDashboard();
        if (viewName === 'subjects') renderSubjectsDashboard();
        if (viewName === 'users') renderUsersDashboard();
        if (viewName === 'logs') renderLogsDashboard();
    });

    // --- GENERIC MODAL SETUP ---
    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelector('.close-btn')?.addEventListener('click', () => modal.style.display = 'none');
        modal.querySelector('.cancel-btn')?.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    });

    // --- DELETE CONFIRMATION MODAL ---
    const deleteConfirmationModal = document.createElement('div');
    deleteConfirmationModal.className = 'delete-confirmation-modal';
    deleteConfirmationModal.innerHTML = `
        <div class="delete-confirmation-modal-content">
            <h3>ยืนยันการลบ</h3>
            <p id="delete-confirm-text">คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?</p>
            <div class="modal-actions">
                <button class="btn btn-secondary cancel-btn">ยกเลิก</button>
                <button class="btn btn-danger confirm-delete-btn">ใช่, ลบเลย</button>
            </div>
        </div>
    `;
    document.body.appendChild(deleteConfirmationModal);
    const confirmDeleteBtn = deleteConfirmationModal.querySelector('.confirm-delete-btn');
    const cancelDeleteBtn = deleteConfirmationModal.querySelector('.delete-confirmation-modal .cancel-btn');
    const deleteConfirmText = deleteConfirmationModal.querySelector('#delete-confirm-text');
    let deleteFunction = null;
    cancelDeleteBtn.addEventListener('click', () => { deleteConfirmationModal.style.display = 'none'; });
    confirmDeleteBtn.addEventListener('click', () => {
        if (deleteFunction) deleteFunction();
        deleteConfirmationModal.style.display = 'none';
    });
    function showDeleteConfirmation(callback, message = 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?') {
        deleteConfirmText.textContent = message;
        deleteFunction = callback;
        deleteConfirmationModal.style.display = 'flex';
    }

    // --- Helper for Empty State ---
    function renderEmptyState(containerSelector, icon, title, text, buttonText, onButtonClick) {
        const container = document.querySelector(containerSelector);
        if (!container) return;
        container.innerHTML = `
            <div class="empty-state-container">
                <div class="empty-state-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${text}</p>
                <button class="btn btn-primary add-from-empty-state">${buttonText}</button>
            </div>`;
        container.querySelector('.add-from-empty-state').addEventListener('click', onButtonClick);
    }
    
    // --- SOLUTIONS LOGIC ---
    const solutionModal = document.getElementById('solution-modal');
    const solutionForm = document.getElementById('solution-form');
    async function renderSolutionsDashboard() {
        try {
            const solutions = await api.get('admin/solutions');
            const container = views.solutions.querySelector('.content-table');
            if (!solutions || solutions.length === 0) {
                renderEmptyState('#view-solutions .content-table', '📂', 'ยังไม่มีข้อมูลเฉลย', 'เริ่มต้นโดยการเพิ่มเฉลยใหม่สำหรับวิชาต่างๆ', 'เพิ่มเฉลยใหม่', () => openSolutionModal('add'));
                return;
            }
            container.innerHTML = `<table id="solutions-table"><thead><tr><th>ชื่อหัวข้อ</th><th>วิชา</th><th>ผู้สร้าง</th><th>ไฟล์แนบ</th><th>การกระทำ</th></tr></thead><tbody></tbody></table>`;
            const tbody = container.querySelector('tbody');
            solutions.forEach(s => {
                const row = tbody.insertRow();
                const fileName = s.file_path ? s.file_path.split('/').pop() : 'ไม่มี';
                row.innerHTML = `<td>${s.title}</td><td>${s.subjectName}</td><td>${s.creator_username}</td><td>${fileName}</td><td class="action-buttons"><button class="btn btn-secondary btn-sm edit-btn">แก้ไข</button><button class="btn btn-info btn-sm upload-btn">ไฟล์</button><button class="btn btn-danger btn-sm delete-btn">ลบ</button></td>`;
                row.querySelector('.edit-btn').addEventListener('click', () => openSolutionModal('edit', s.id));
                row.querySelector('.upload-btn').addEventListener('click', () => openUploadModal(s.id));
                row.querySelector('.delete-btn').addEventListener('click', () => showDeleteConfirmation(async () => {
                    try { await api.delete('admin/solutions', s.id); showToast('success', 'ลบเฉลยเรียบร้อย'); renderSolutionsDashboard(); } catch (error) { showToast('error', error.message); }
                }));
            });
        } catch (error) {
            showToast('error', `เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
    async function openSolutionModal(mode, solutionId = null) {
        solutionForm.reset();
        solutionForm.querySelector('#solution-id').value = solutionId || '';
        const subjects = await api.get('subjects');
        solutionForm.querySelector('#solution-subject').innerHTML = subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (mode === 'edit' && solutionId) {
            const solution = await api.get(`admin/solutions/${solutionId}`);
            solutionModal.querySelector('#solution-modal-title').textContent = 'แก้ไขเฉลย';
            solutionForm.querySelector('#solution-title').value = solution.title;
            solutionForm.querySelector('#solution-subject').value = solution.subject_id;
            solutionForm.querySelector('#solution-text-content').value = solution.content || '';
        } else {
            solutionModal.querySelector('#solution-modal-title').textContent = 'เพิ่มเฉลยใหม่';
        }
        solutionModal.style.display = 'flex';
    }
    solutionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#solution-id').value;
        const isNew = !id;
        const data = { title: e.target.querySelector('#solution-title').value, subject_id: e.target.querySelector('#solution-subject').value, content: e.target.querySelector('#solution-text-content').value };
        try {
            await (id ? api.put('admin/solutions', id, data) : api.post('admin/solutions', data));
            solutionModal.style.display = 'none';
            showToast('success', isNew ? 'เพิ่มเฉลยสำเร็จ!' : 'บันทึกการแก้ไขสำเร็จ!');
            renderSolutionsDashboard();
        } catch (error) {
            showToast('error', error.message);
        }
    });
    
    // File Upload Logic
    const fileUploadModal = document.getElementById('file-upload-modal');
    function openUploadModal(solutionId) {
        const uploadForm = fileUploadModal.querySelector('#file-upload-form');
        uploadForm.reset();
        fileUploadModal.querySelector('#file-preview').textContent = '';
        uploadForm.querySelector('#upload-solution-id').value = solutionId;
        fileUploadModal.style.display = 'flex';
    }
    async function uploadFile(file) {
        const solutionId = fileUploadModal.querySelector('#upload-solution-id').value;
        const filePreview = fileUploadModal.querySelector('#file-preview');
        filePreview.textContent = 'กำลังอัปโหลด...';
        const formData = new FormData();
        formData.append('file', file);
        try {
             const token = localStorage.getItem('access_token');
             const response = await fetch(`${API_BASE_URL}/api/admin/solutions/${solutionId}/upload`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData 
            });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.message || 'Upload failed');
            showToast('success', 'อัปโหลดไฟล์สำเร็จ!');
            filePreview.textContent = `สำเร็จ: ${file.name}`;
            setTimeout(() => { fileUploadModal.style.display = 'none'; renderSolutionsDashboard(); }, 1500);
        } catch (error) {
            showToast('error', error.message);
            filePreview.textContent = `เกิดข้อผิดพลาด: ${error.message}`;
        }
    }
    fileUploadModal.querySelector('#file-upload-area').addEventListener('click', () => fileUploadModal.querySelector('#file-input').click());
    fileUploadModal.querySelector('#file-input').addEventListener('change', (e) => { if (e.target.files.length > 0) uploadFile(e.target.files[0]); });

    // --- SUBJECTS LOGIC ---
    const subjectModal = document.getElementById('subject-modal');
    const subjectForm = document.getElementById('subject-form');
    async function renderSubjectsDashboard() {
        try {
            const subjects = await api.get('admin/subjects');
            const container = views.subjects.querySelector('.content-table');
            if(!subjects || subjects.length === 0) {
                renderEmptyState('#view-subjects .content-table', '📚', 'ยังไม่มีข้อมูลวิชา', 'คุณสามารถเพิ่มรายวิชาเพื่อจัดหมวดหมู่เฉลยได้ที่นี่', 'เพิ่มวิชาใหม่', () => openSubjectModal('add'));
                return;
            }
            container.innerHTML = `<table id="subjects-table"><thead><tr><th>ID</th><th>ไอคอน</th><th>ชื่อวิชา</th><th>การกระทำ</th></tr></thead><tbody></tbody></table>`;
            const tbody = container.querySelector('tbody');
            subjects.forEach(s => {
                const row = tbody.insertRow();
                row.innerHTML = `<td>${s.id}</td><td>${s.icon}</td><td>${s.name}</td><td><button class="btn btn-secondary btn-sm edit-btn">แก้ไข</button> <button class="btn btn-danger btn-sm delete-btn">ลบ</button></td>`;
                row.querySelector('.edit-btn').addEventListener('click',()=>openSubjectModal('edit',s));
                row.querySelector('.delete-btn').addEventListener('click',()=>showDeleteConfirmation(async()=>{ try { await api.delete('admin/subjects',s.id); showToast('success', 'ลบวิชาเรียบร้อย'); renderSubjectsDashboard(); } catch (error) { showToast('error', error.message); }},'แน่ใจหรือไม่? เฉลยทั้งหมดในวิชานี้จะถูกลบไปด้วย'));
            });
        } catch (error) {
            showToast('error', `เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
    function openSubjectModal(mode, subject={}) {
        subjectForm.reset();
        subjectForm.querySelector('#subject-id').value = subject.id || '';
        subjectModal.querySelector('#subject-modal-title').textContent = mode === 'edit' ? 'แก้ไขวิชา' : 'เพิ่มวิชาใหม่';
        if (mode === 'edit') {
            subjectForm.querySelector('#subject-name').value = subject.name;
            subjectForm.querySelector('#subject-icon').value = subject.icon;
        }
        subjectModal.style.display = 'flex';
    }
    subjectForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const id = e.target.querySelector('#subject-id').value;
        const isNew = !id;
        const data = { name: e.target.querySelector('#subject-name').value, icon: e.target.querySelector('#subject-icon').value };
        try {
            await (id ? api.put('admin/subjects', id, data) : api.post('admin/subjects', data));
            subjectModal.style.display = 'none';
            showToast('success', isNew ? 'เพิ่มวิชาสำเร็จ!' : 'บันทึกการแก้ไขสำเร็จ!');
            renderSubjectsDashboard();
        } catch (error) {
            showToast('error', error.message);
        }
    });

    // --- USERS LOGIC ---
    const userModal = document.getElementById('user-modal');
    const userForm = document.getElementById('user-form');
    async function renderUsersDashboard() {
        try {
            const users = await api.get('admin/users');
            const container = views.users.querySelector('.content-table');
            if (!users || users.length === 0) {
                renderEmptyState('#view-users .content-table', '👥', 'ยังไม่มีข้อมูลผู้ใช้', 'คุณสามารถเพิ่มผู้ใช้และกำหนดสิทธิ์ได้ที่นี่', 'เพิ่มผู้ใช้ใหม่', () => openUserModal('add'));
                return;
            }
            container.innerHTML = `<table id="users-table"><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>การกระทำ</th></tr></thead><tbody></tbody></table>`;
            const tbody = container.querySelector('tbody');
            users.forEach(u => {
                const row = tbody.insertRow();
                row.innerHTML = `<td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td><button class="btn btn-secondary btn-sm edit-btn">แก้ไข</button> <button class="btn btn-danger btn-sm delete-btn" ${u.id === 1 ? 'disabled' : ''}>ลบ</button></td>`;
                row.querySelector('.edit-btn').addEventListener('click', () => openUserModal('edit', u));
                if (u.id !== 1) {
                    row.querySelector('.delete-btn').addEventListener('click', () => showDeleteConfirmation(async () => { try { await api.delete('admin/users', u.id); showToast('success', 'ลบผู้ใช้เรียบร้อย'); renderUsersDashboard(); } catch (error) { showToast('error', error.message); } }));
                }
            });
        } catch (error) {
            showToast('error', `เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
    function openUserModal(mode, user={}) {
        userForm.reset();
        userForm.querySelector('#user-id').value = user.id || '';
        userModal.querySelector('#user-modal-title').textContent = mode === 'edit' ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่';
        userForm.querySelector('#user-password').required = (mode !== 'edit');
        if (mode === 'edit') {
            userForm.querySelector('#user-username').value = user.username;
            userForm.querySelector('#user-role').value = user.role;
        }
        userModal.style.display = 'flex';
    }
    userForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const id = e.target.querySelector('#user-id').value;
        const isNew = !id;
        const data = { username: e.target.querySelector('#user-username').value, role: e.target.querySelector('#user-role').value };
        const password = e.target.querySelector('#user-password').value;
        if (password) data.password = password;
        if (isNew && !password) {
            showToast('error', 'กรุณากำหนดรหัสผ่านสำหรับผู้ใช้ใหม่');
            return;
        }
        try {
            await (id ? api.put('admin/users', id, data) : api.post('admin/users', data));
            userModal.style.display = 'none';
            showToast('success', isNew ? 'เพิ่มผู้ใช้สำเร็จ!' : 'บันทึกการแก้ไขสำเร็จ!');
            renderUsersDashboard();
        } catch (error) {
            showToast('error', error.message);
        }
    });

    // --- LOGS LOGIC ---
    async function renderLogsDashboard() {
        try {
            const [loginHistory, activityLogs] = await Promise.all([
                api.get('admin/login-history'),
                api.get('admin/activity-logs')
            ]);
            renderLoginHistoryTable(loginHistory);
            renderActivityLogTable(activityLogs);
        } catch (error) {
            showToast('error', `เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}`);
        }
    }
    function renderLoginHistoryTable(logs) {
        const container = document.getElementById('login-history-container');
        if (!logs || logs.length === 0) {
            container.innerHTML = `<div class="empty-state-container" style="padding: 2rem;"><p>ยังไม่มีประวัติการล็อกอิน</p></div>`;
            return;
        }
        container.innerHTML = `<table id="login-history-table"><thead><tr><th>ผู้ใช้</th><th>IP Address</th><th>User Agent</th><th>เวลา</th></tr></thead><tbody></tbody></table>`;
        const tbody = container.querySelector('tbody');
        logs.forEach(log => {
            const row = tbody.insertRow();
            row.innerHTML = `<td>${log.username}</td><td>${log.ip_address}</td><td><small>${log.user_agent}</small></td><td>${log.timestamp}</td>`;
        });
    }
    function renderActivityLogTable(logs) {
        const container = document.getElementById('activity-log-container');
        if (!logs || logs.length === 0) {
            container.innerHTML = `<div class="empty-state-container" style="padding: 2rem;"><p>ยังไม่มีบันทึกกิจกรรม</p></div>`;
            return;
        }
        container.innerHTML = `<table id="activity-log-table"><thead><tr><th>ผู้ใช้</th><th>กิจกรรม</th><th>เวลา</th></tr></thead><tbody></tbody></table>`;
        const tbody = container.querySelector('tbody');
        logs.forEach(log => {
            const row = tbody.insertRow();
            row.innerHTML = `<td>${log.username}</td><td>${log.action}</td><td>${log.timestamp}</td>`;
        });
    }

    // --- HEADER BUTTONS ---
    document.getElementById('add-solution-btn-header').addEventListener('click', () => openSolutionModal('add'));
    document.getElementById('add-subject-btn-header').addEventListener('click', () => openSubjectModal('add'));
    document.getElementById('add-user-btn-header').addEventListener('click', () => openUserModal('add'));

    // --- INITIAL LOAD & LOGOUT ---
    renderSolutionsDashboard();
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
});