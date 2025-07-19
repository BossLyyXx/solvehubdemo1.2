document.addEventListener('DOMContentLoaded', () => {
    // หาปุ่มทั้งหมดที่ใช้สลับธีม
    const themeToggleBtns = document.querySelectorAll('[id^="theme-toggle"]');
    const currentTheme = localStorage.getItem('theme');

    // ฟังก์ชันสำหรับอัปเดตหน้าเว็บและปุ่ม
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggleBtns.forEach(btn => btn.textContent = '☀️');
        } else {
            document.body.classList.remove('dark-mode');
            themeToggleBtns.forEach(btn => btn.textContent = '🌙');
        }
    }

    // ใช้ธีมที่บันทึกไว้เมื่อโหลดหน้า
    applyTheme(currentTheme);

    // เพิ่ม Event Listener ให้ทุกปุ่ม
    themeToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            let newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    });
});