const API = "http://localhost:3000";

// --------------------
// GET AGENT ID
// --------------------
const agentId = localStorage.getItem("agentId");

if (!agentId) {
    alert("Please login first!");
    window.location.href = "login.html";
}

// --------------------
// LOAD CUSTOMERS
// --------------------
async function loadCustomers() {
    try {
        const res = await fetch(`${API}/agent/customers?agentId=${agentId}`);
        const customers = await res.json();

        console.log("Loaded customers:", customers);

        const list = document.getElementById("customerList");
        list.innerHTML = "";

        if (customers.length === 0) {
            list.innerHTML = "<p>No customers assigned.</p>";
            return;
        }

        customers.forEach(cust => {
            const div = document.createElement("div");
            div.className = "customer";
            div.innerText = cust.number;

            div.onclick = () => selectCustomer(cust.number);

            list.appendChild(div);
        });

    } catch (err) {
        console.error("Customer load error:", err);
    }
}

// --------------------
// SELECT CUSTOMER
// --------------------
function selectCustomer(number) {
    document.getElementById("chatTitle").innerText = "Chat with " + number;
    window.currentCustomer = number;
}

loadCustomers();
