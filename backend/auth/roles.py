"""Peran dan hak akses. Satu-satunya tempat yang mendefinisikan nilai `users.role`."""

USER = "user"
AUDITOR = "auditor"
DCA_OFFICER = "dca_officer"        # IT DCA Officer = Admin Maker (mengajukan perubahan role)
DCA_SUPERVISOR = "dca_supervisor"  # IT DCA Supervisor = Admin Approver (menyetujui/menolak)
SUPER_ADMIN = "super_admin"        # mengubah role langsung tanpa dual control

ALL_ROLES = (USER, AUDITOR, DCA_OFFICER, DCA_SUPERVISOR, SUPER_ADMIN)
ADMIN_ROLES = (DCA_OFFICER, DCA_SUPERVISOR, SUPER_ADMIN)           # peran yang menentukan invarian
VIEW_ROLES = (AUDITOR, DCA_OFFICER, DCA_SUPERVISOR, SUPER_ADMIN)   # lihat user, log audit, pengajuan
REQUESTABLE_BY_OFFICER = (USER, AUDITOR, DCA_OFFICER, DCA_SUPERVISOR)  # super_admin hanya oleh Super Admin langsung
APPROVER_ROLES = (DCA_SUPERVISOR, SUPER_ADMIN)

ROLE_LABELS = {
    USER: "User",
    AUDITOR: "Auditor",
    DCA_OFFICER: "IT DCA Officer",
    DCA_SUPERVISOR: "IT DCA Supervisor",
    SUPER_ADMIN: "Super Admin",
}
