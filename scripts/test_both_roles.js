async function testBothRoles() {
  console.log('=== Test 1: Admin Login ===');
  const adminRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@admin.com', password: 'admin1' })
  });
  const adminData = await adminRes.json();
  console.log('Admin role:', adminData.role);
  console.log('Admin redirect:', adminData.role === 'admin' ? '/admin/overview.html' : '../user/profile.html');
  
  console.log('\n=== Test 2: Customer Login ===');
  const custRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test1@test.com', password: 'test1' })
  });
  const custData = await custRes.json();
  console.log('Customer role:', custData.role);
  console.log('Customer redirect:', custData.role === 'admin' ? '/admin/overview.html' : '../user/profile.html');
}

testBothRoles();
