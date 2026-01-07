import Home from './pages/Home';
import Meals from './pages/Meals';
import Glucose from './pages/Glucose';
import Medications from './pages/Medications';
import Exercise from './pages/Exercise';
import Sleep from './pages/Sleep';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Meals": Meals,
    "Glucose": Glucose,
    "Medications": Medications,
    "Exercise": Exercise,
    "Sleep": Sleep,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};