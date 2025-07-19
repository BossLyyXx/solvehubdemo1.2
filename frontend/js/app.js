import { API_BASE_URL } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- User/Logout section ---
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logout-btn');

    if (usernameDisplay) {
        const username = localStorage.getItem('username');
        if (username) {
            usernameDisplay.textContent = `ผู้ใช้: ${username}`;
        }
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'index.html';
        });
    }

    const pathname = window.location.pathname.split('/').pop();

    if (pathname === 'subjects.html' || pathname === '' || pathname.includes('index.html')) {
        const token = localStorage.getItem('access_token');
        if (!token && (pathname === 'subjects.html')) {
             window.location.href = 'index.html';
             return;
        }
        if(token && (pathname === '' || pathname.includes('index.html'))){
            window.location.href = 'subjects.html';
            return;
        }
        renderSubjectsPage();
    } else if (pathname === 'solutions.html') {
        renderSolutionsPage();
    } else if (pathname === 'solution-detail.html') {
        renderSolutionDetailPage();
    }
});

async function renderSubjectsPage() {
    const grid = document.getElementById('subjects-grid');
    if (!grid) return;
    grid.innerHTML = '<p>กำลังโหลดข้อมูลวิชา...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/subjects`);
        if (!response.ok) throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        const subjects = await response.json();
        grid.innerHTML = '';
        if (subjects.length === 0) {
            grid.innerHTML = '<p>ยังไม่มีข้อมูลวิชาในระบบ</p>';
            return;
        }
        subjects.forEach(subject => {
            const box = document.createElement('div');
            box.className = 'subject-box';
            box.innerHTML = `<div class="subject-icon">${subject.icon || '📚'}</div><h3>${subject.name}</h3>`;
            box.addEventListener('click', () => {
                sessionStorage.setItem('selectedSubjectName', subject.name);
                window.location.href = `solutions.html?subject_id=${subject.id}`;
            });
            grid.appendChild(box);
        });
    } catch (error) {
        grid.innerHTML = `<p style="color: red;">เกิดข้อผิดพลาด: ${error.message}</p>`;
    }
}

async function renderSolutionsPage() {
    const titleEl = document.getElementById('subject-title');
    const listEl = document.getElementById('solutions-list');
    if (!titleEl || !listEl) return;
    const urlParams = new URLSearchParams(window.location.search);
    const subjectId = urlParams.get('subject_id');
    if (!subjectId) {
        titleEl.textContent = "ไม่พบรหัสวิชา";
        return;
    }
    const subjectName = sessionStorage.getItem('selectedSubjectName');
    titleEl.textContent = `วิชา: ${subjectName || 'กำลังโหลด...'}`;
    listEl.innerHTML = '<p>กำลังโหลดรายการเฉลย...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/subjects/${subjectId}/solutions`);
        if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
        const solutions = await response.json();
        listEl.innerHTML = '';
        if (solutions.length === 0) {
            listEl.innerHTML = '<p>ยังไม่มีเฉลยในวิชานี้</p>';
            return;
        }
        solutions.forEach(solution => {
            const card = document.createElement('div');
            card.className = 'solution-card';
            card.innerHTML = `
                <div class="solution-info">
                    <h4>${solution.title}</h4>
                    <p>จัดทำเมื่อ: ${solution.date}</p>
                    <p class="creator-name">เฉลยโดย: ${solution.creator_username}</p> 
                </div>
                <a href="solution-detail.html?solution_id=${solution.id}" class="btn btn-primary">ดูเฉลย</a>`;
            listEl.appendChild(card);
        });
    } catch (error) {
        listEl.innerHTML = `<p style="color: red;">เกิดข้อผิดพลาด: ${error.message}</p>`;
    }
}

async function renderSolutionDetailPage() {
    const titleEl = document.getElementById('solution-title');
    const contentEl = document.getElementById('solution-content');
    const backLink = document.getElementById('back-to-solutions');
    if (!titleEl || !contentEl) return;

    const urlParams = new URLSearchParams(window.location.search);
    const solutionId = urlParams.get('solution_id');
    if (!solutionId) { titleEl.textContent = 'ไม่พบรหัสเฉลย'; return; }
    
    titleEl.textContent = 'กำลังโหลด...';
    try {
        const response = await fetch(`${API_BASE_URL}/api/solutions/${solutionId}`);
        if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
        const detail = await response.json();
        titleEl.textContent = detail.title;
        let finalContent = '';
        if (detail.content) {
            finalContent += `<div class="text-content">${detail.content}</div>`;
        }
        if (detail.file_path) {
            const filePath = detail.file_path;
            const fullUrl = `${API_BASE_URL}${filePath}`;
            if (/\.(jpeg|jpg|gif|png|svg)$/i.test(filePath)) {
                finalContent += `<img src="${fullUrl}" alt="Solution File" style="max-width:100%; margin-top: 1rem; border-radius: 8px;">`;
            } else {
                finalContent += `<p style="margin-top: 1rem;"><a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">ดาวน์โหลดไฟล์แนบ</a></p>`;
            }
        }
        contentEl.innerHTML = finalContent || '<p>ไม่มีเนื้อหาสำหรับเฉลยนี้</p>';
        if (backLink) {
            backLink.href = `solutions.html?subject_id=${detail.subject_id}`;
        }
    } catch (error) {
        titleEl.textContent = 'เกิดข้อผิดพลาด';
        contentEl.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}