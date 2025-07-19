let API_BASE_URL;

// เช็คว่า hostname ของหน้าเว็บคือ '127.0.0.1' หรือ 'localhost' หรือไม่
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  // ถ้าใช่ แสดงว่ารันบนเครื่องตัวเอง (Local)
  API_BASE_URL = 'http://127.0.0.1:5000';
} else {
  // ถ้าไม่ใช่ แสดงว่าเป็นเว็บจริง (Production)
  API_BASE_URL = 'https://solvehubdemo1-1.onrender.com';
}

export { API_BASE_URL };