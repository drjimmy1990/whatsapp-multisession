// public/js/admin_login.js

const loginForm = document.getElementById('login-form');
const errorMessageEl = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorMessageEl.style.display = 'none';

    const password = loginForm.password.value;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        // On successful login, redirect to the admin dashboard
        window.location.href = '/admin';

    } catch (error) {
        errorMessageEl.textContent = "Error: " + error.message;
        errorMessageEl.style.display = 'block';
    }
});