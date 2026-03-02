async function testLoginAndRedirect() {
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@admin.com', password: 'admin1' })
    });

    const data = await response.json();
    console.log('Login response:', data);

    if (response.ok) {
      console.log('Login successful!');
      console.log('Role:', data.role);
      
      const redirect = data.role === 'admin' ? '/admin/overview.html' : '../user/profile.html';
      console.log('Would redirect to:', redirect);

      console.log('\nTesting /admin access with cookie...');
      const adminRes = await fetch('http://localhost:3000/admin', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('Admin access status:', adminRes.status);
    } else {
      console.log('Login failed');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLoginAndRedirect();
