// Test inventory API
const http = require('http');

async function testInventoryAPI() {
  const base = 'http://localhost:3000';

  // Test 1: Get all products
  console.log('\n=== TEST 1: Get All Products ===');
  const allProducts = await fetch(`${base}/api/products`).then(r => r.json());
  console.log(`Found ${allProducts.length} products:`, allProducts.map(p => `${p.name} (${p.category})`).join(', '));

  // Test 2: Filter by category
  console.log('\n=== TEST 2: Filter by Category (Accessories) ===');
  const accessories = await fetch(`${base}/api/products?category=Accessories`).then(r => r.json());
  console.log(`Found ${accessories.length} accessories:`, accessories.map(p => p.name).join(', '));

  // Test 3: Search
  console.log('\n=== TEST 3: Search (Kibble) ===');
  const search = await fetch(`${base}/api/products?search=Kibble`).then(r => r.json());
  console.log(`Found ${search.length} results:`, search.map(p => p.name).join(', '));

  // Test 4: Add new product
  console.log('\n=== TEST 4: Add New Product ===');
  const addRes = await fetch(`${base}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Product',
      category: 'Treats',
      price: 99.99,
      quantity: 50
    })
  });
  const newProduct = await addRes.json();
  console.log('Added product:', newProduct);

  // Test 5: Update product
  console.log('\n=== TEST 5: Update Product ===');
  const updateRes = await fetch(`${base}/api/admin/products/${newProduct.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Updated Test Product',
      category: 'Treats',
      price: 149.99,
      quantity: 100
    })
  });
  const updateResult = await updateRes.json();
  console.log('Update result:', updateResult);

  // Verify update
  const updated = await fetch(`${base}/api/products/${newProduct.id}`).then(r => r.json());
  console.log('Verified updated product:', updated);

  // Test 6: Delete product
  console.log('\n=== TEST 6: Delete Product ===');
  const deleteRes = await fetch(`${base}/api/admin/products/${newProduct.id}`, {
    method: 'DELETE'
  });
  const deleteResult = await deleteRes.json();
  console.log('Delete result:', deleteResult);

  // Verify delete
  const allAfterDelete = await fetch(`${base}/api/products`).then(r => r.json());
  console.log(`After delete: ${allAfterDelete.length} products remain`);
}

testInventoryAPI().catch(console.error);
