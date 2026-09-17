document.addEventListener('DOMContentLoaded', function() {
    const companySelect = document.getElementById('id_company');
    const customerSelect = document.getElementById('id_customer');

    if (companySelect && customerSelect) {
        companySelect.addEventListener('change', function() {
            const companyId = this.value;
            customerSelect.innerHTML = '<option value="">---------</option>';
            
            if (companyId) {
                // Fetch customers for the selected company
                fetch(`/admin/security_crm/securityproposal/api/get-customers/?company_id=${companyId}`)
                    .then(response => response.json())
                    .then(data => {
                        data.customers.forEach(function(customer) {
                            const option = document.createElement('option');
                            option.value = customer.id;
                            option.textContent = customer.name;
                            customerSelect.appendChild(option);
                        });
                    })
                    .catch(error => console.error('Error fetching customers:', error));
            }
        });
    }
});
