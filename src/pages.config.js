import CGMDashboard from './pages/CGMDashboard';
import Exercise from './pages/Exercise';
import Glucose from './pages/Glucose';
import Home from './pages/Home';
import Meals from './pages/Meals';
import Medications from './pages/Medications';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import Sleep from './pages/Sleep';
import Landing from './pages/Landing';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CGMDashboard": CGMDashboard,
    "Exercise": Exercise,
    "Glucose": Glucose,
    "Home": Home,
    "Meals": Meals,
    "Medications": Medications,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "Sleep": Sleep,
    "Landing": Landing,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};