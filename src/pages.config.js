import CGMDashboard from './pages/CGMDashboard';
import Exercise from './pages/Exercise';
import Glucose from './pages/Glucose';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Meals from './pages/Meals';
import Medications from './pages/Medications';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import Sleep from './pages/Sleep';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CGMDashboard": CGMDashboard,
    "Exercise": Exercise,
    "Glucose": Glucose,
    "Home": Home,
    "Landing": Landing,
    "Meals": Meals,
    "Medications": Medications,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "Sleep": Sleep,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};