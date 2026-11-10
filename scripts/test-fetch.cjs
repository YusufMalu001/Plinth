const res = await fetch('http://localhost:5000/api/v1/health');
const data = await res.json();
console.log('API health from node fetch:', data);
