// public/js/user_login.js

const loginForm = document.getElementById('login-form');
const errorMessageEl = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorMessageEl.style.display = 'none';

    const username = loginForm.username.value;
    const password = loginForm.password.value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        // On successful login, redirect to the dashboard with the token
        window.location.href = `/user/dashboard?token=${result.token}`;

    } catch (error) {
        errorMessageEl.textContent = error.message;
        errorMessageEl.style.display = 'block';
    }
});