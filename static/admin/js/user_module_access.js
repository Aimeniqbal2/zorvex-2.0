(function($) {
    $(document).ready(function() {
        const companySelect = $('#id_company');
        const accessModeSelect = $('#id_access_mode');
        const customModulesContainer = $('.field-custom_modules');
        const customModulesSelect = $('#id_custom_modules');
        
        function updateUI() {
            const accessMode = accessModeSelect.val();
            if (accessMode === 'CUSTOM') {
                customModulesContainer.show();
            } else {
                customModulesContainer.hide();
            }
        }

        function fetchModules() {
            const companyId = companySelect.val();
            if (!companyId) {
                customModulesSelect.empty();
                return;
            }

            // Fetch the modules enabled for this company
            $.ajax({
                url: '/admin/accounts/user/api/company-modules/',
                data: { company_id: companyId },
                success: function(response) {
                    // Save currently selected modules
                    const selected = customModulesSelect.val() || [];
                    
                    customModulesSelect.empty();
                    response.modules.forEach(function(mod) {
                        const option = $('<option></option>').attr('value', mod.code).text(mod.name);
                        if (selected.includes(mod.code)) {
                            option.attr('selected', 'selected');
                        }
                        customModulesSelect.append(option);
                    });
                }
            });
        }

        // Initial setup
        updateUI();
        
        // Listeners
        accessModeSelect.change(updateUI);
        
        companySelect.change(function() {
            fetchModules();
        });
        
        // Fetch once on load if company is already selected
        if (companySelect.val()) {
            fetchModules();
        }
    });
})(django.jQuery);
