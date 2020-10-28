import firebase from "firebase/app";
import { auth } from "firebaseui";

export interface Iuser {
  id: string;
  name: string;
  email: string;
}

const firebaseConfig = {
  apiKey: "AIzaSyCKxOAhXymGjUrtiodvue3xL7WA16qd9cc",
  authDomain: "rss-feed-proxy.firebaseapp.com",
  projectId: "rss-feed-proxy",
  appId: "1:1090474250814:web:6a5631b43bc8b5e13d376f"
};

const uiConfig = {
  signInSuccessUrl: `${location.origin}/`,
  signInOptions: [
    firebase.auth.EmailAuthProvider.PROVIDER_ID,
  ],
  tosUrl: "",
  privacyPolicyUrl: "",
};

let authUi = null;
let user: Iuser = null;
let authStateChangeCallback = null;

const onAuthStateChanged = (authUser) => {
  if (authUser) {
    console.log(authUser)
    if (!user || authUser.uid !== user.id) {
      user = { id: authUser.uid, name: authUser.displayName, email: authUser.email };
      if (!user.name) user.name = authUser.email;
      authStateChangeCallback(user);
    }
  } else {
    if (user) {
      user = null;
      authStateChangeCallback(user);
    }
  }
};

export const init = (onStateChange: (user: Iuser) => void) => {
  authStateChangeCallback = onStateChange;

  firebase.initializeApp(firebaseConfig);
  firebase.auth().onAuthStateChanged(onAuthStateChanged, (e) => { throw e };
  authUi = new auth.AuthUI(firebase.auth());
}

export const signIn = () => {
  authUi.start("#firebaseui-auth-container", uiConfig);
};

export const signOut = () => {
  firebase.auth().signOut();
};
