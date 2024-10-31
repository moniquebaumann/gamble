pm2 start --interpreter ts-node gamble.ts

pm2 start gamble-for-freedom -- -P tsconfig.json ./gamble.ts
