import * as passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:9000/api/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }));
} else {
  console.warn('Google OAuth not configured: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing');
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user as any);
});

export default passport;