document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    const sectionMap = {
        'Projects': 'projects',
        'Approval Requests': 'approval-requests',
        'Audit Logs': 'audit-logs',
        'User Management': 'user-management'
    };

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            navItems.forEach((el) => el.classList.remove('active'));
            item.classList.add('active');

            const targetKey = sectionMap[item.textContent.trim()];
            sections.forEach((section) => {
                section.classList.toggle(
                    'active',
                    section.dataset.section === targetKey
                );
            });
        });
    });
});
