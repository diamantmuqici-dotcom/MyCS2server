import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout.js';
import { ScrollToTop } from './components/ScrollToTop.js';
import { Home } from './pages/Home.js';
import { Announcements } from './pages/Announcements.js';
import { AnnouncementDetail } from './pages/AnnouncementDetail.js';
import { Rules } from './pages/Rules.js';
import { Status } from './pages/Status.js';
import { NotFound } from './pages/NotFound.js';
import { DashboardLayout } from './dashboard/DashboardLayout.js';
import { Overview } from './dashboard/Overview.js';
import { Cases } from './dashboard/Cases.js';
import { CaseDetail } from './dashboard/CaseDetail.js';
import { Bans } from './dashboard/Bans.js';
import { Staff } from './dashboard/Staff.js';
import { SteamPage } from './dashboard/Steam.js';
import { SteamDetail } from './dashboard/SteamDetail.js';
import { PcChecks } from './dashboard/PcChecks.js';
import { PcCheckDetail } from './dashboard/PcCheckDetail.js';
import { AnnouncementsAdmin } from './dashboard/AnnouncementsAdmin.js';
import { AuditLog } from './dashboard/AuditLog.js';
import { Settings } from './dashboard/Settings.js';
import { Access } from './dashboard/Access.js';
import { System } from './dashboard/System.js';

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/announcements/:slug" element={<AnnouncementDetail />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/status" element={<Status />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="cases" element={<Cases />} />
          <Route path="cases/:ref" element={<CaseDetail />} />
          <Route path="bans" element={<Bans />} />
          <Route path="staff" element={<Staff />} />
          <Route path="steam" element={<SteamPage />} />
          <Route path="steam/:steamId64" element={<SteamDetail />} />
          <Route path="pc-checks" element={<PcChecks />} />
          <Route path="pc-checks/:ref" element={<PcCheckDetail />} />
          <Route path="announcements" element={<AnnouncementsAdmin />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="settings" element={<Settings />} />
          <Route path="access" element={<Access />} />
          <Route path="system" element={<System />} />
          <Route path="*" element={<NotFound inDashboard />} />
        </Route>
      </Routes>
    </>
  );
}
