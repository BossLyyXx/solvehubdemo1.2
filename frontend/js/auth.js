import { API_BASE_URL } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- VVV ส่วนที่เพิ่มเข้ามา VVV ---
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) {
        googleLoginBtn.href = `${API_BASE_URL}/login/google`;
    }
    // --- ^^^ สิ้นสุดส่วนที่เพิ่มเข้ามา ^^^ ---

    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = e.target.username.value;
            const password = e.target.password.value;
            const loginButton = e.target.querySelector('button[type="submit"]');
            loginButton.disabled = true;
            loginButton.textContent = 'กำลังตรวจสอบ...';

            try {
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
                }
                
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('user_role', data.user.role);
                localStorage.setItem('username', data.user.username);

                loginButton.textContent = 'สำเร็จ!';
                const welcomeMessage = `ยินดีต้อนรับคุณ ${data.user.username}`;
                
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'เข้าสู่ระบบสำเร็จ!',
                        text: welcomeMessage,
                        timer: 1500,
                        showConfirmButton: false
                    });
                    
                    setTimeout(() => {
                        redirectToDashboard(data.user.role);
                    }, 1600);

                } else {
                    alert(welcomeMessage);
                    redirectToDashboard(data.user.role);
                }

            } catch (error) {
                 if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'เข้าสู่ระบบไม่สำเร็จ',
                        text: 'กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่านอีกครั้ง'
                    });
                } else {
                    alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);
                }
                loginButton.disabled = false;
                loginButton.textContent = 'เข้าสู่ระบบ';
            }
        });
    }

    function redirectToDashboard(role) {
        if (role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else if (role === 'moderator') {
            window.location.href = 'moderator-dashboard.html';
        } else {
            window.location.href = 'subjects.html';
        }
    }
});
