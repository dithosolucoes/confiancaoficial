import React from "react";
import { Navigate } from "react-router-dom";

/**
 * @deprecated
 * O monolito GestorDashboard.tsx (5.651 linhas) foi descontinuado e fatiado
 * nos módulos independentes em src/modules/admin/pages/ sob o AdminLayout.tsx.
 * Este arquivo foi mantido como um ponteiro de redirecionamento para evitar erros de importação.
 */
export const GestorDashboard: React.FC = () => {
  return <Navigate to="/admin/dashboard" replace />;
};

export default GestorDashboard;
