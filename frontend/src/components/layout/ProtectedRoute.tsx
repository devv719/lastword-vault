import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LastWordMark } from '../ui/LastWordMark';

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center space-y-4">
        <LastWordMark size={36} animated className="text-accent" />
        <p className="text-xs font-mono tracking-widest text-muted-text uppercase">
          Verifying security enclave...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

