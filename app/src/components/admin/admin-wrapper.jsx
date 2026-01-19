"use client";

import dynamic from "next/dynamic";

const AdminApp = dynamic(() => import("@/components/admin/admin-app"), {
    ssr: false,
});

export function AdminWrapper() {
    return <AdminApp />;
}