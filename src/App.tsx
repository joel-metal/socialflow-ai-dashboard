import React from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { PredictiveReachDashboard } from './components/dashboard/PredictiveReachDashboard';

function App() {
  return (
    <DashboardLayout>
      <PredictiveReachDashboard />
    </DashboardLayout>
  );
}

export default App;
