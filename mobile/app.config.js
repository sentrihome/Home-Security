const appJson = require('./app.json');

/** Bake Web client into extra so store/dev builds can send it to the Pi over LAN. */
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      googleWebClientSecret: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET || '',
    },
  },
};
