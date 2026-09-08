# 小豆島バス路線 <i>(Shōdoshima Basu Rosen)</i><br/>[Shodoshima Bus Routes](https://shodoshima-transport.vercel.app/)<br/>by [Dean Spooner](https://github.com/DeanSpooner) 🫒 🏝️ 🚌

This is a web app to provide information on Shodoshima's town bus service, including an interactive map of every route and stop, live-simulated bus positions, and stop timetables - [now deployed live here](https://shodoshima-transport.vercel.app/)!

## Stack

- HTML;
- TypeScript;
- React;
- Vite;
- Tailwind;
- MapLibre GL JS;
- Vercel;
- i18n.

## Running the Basu Rosen app locally

1. Clone this repo;
2. `cd` into the repo's `app` directory;
3. Create a `.env` file, with `ODPT_ACCESS_TOKEN=yourAccessToken` - this will require you to register with the [Public Transportation Open Data Center 公共交通オープンデータセンター](https://www.odpt.org/) and request an access token;
4. `npm install`;
5. `npm run dev`;
6. Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

## Project aims and features

- [x] Provide an interactive map of every stop and route on Shodoshima's town bus network;
- [x] Simulate live bus positions along each route, animated from the published timetable, using data from the [Public Transportation Open Data Center 公共交通オープンデータセンター](https://www.odpt.org/);
- [x] Provide a searchable, cross-language stop finder, matching Japanese, kana and English queries alike;
- [x] Allow filtering the map by route;
- [x] Use i18n localisations to offer multilingual support - currently supported in English and Japanese.

# By [Dean Spooner](https://github.com/DeanSpooner) 🫒 🏝️ 🚌

<p align="center">
  <img src="./app/public/olive-badge.svg" width="160" height="160" />
</p>
