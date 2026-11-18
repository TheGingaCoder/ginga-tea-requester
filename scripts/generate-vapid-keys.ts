import * as webpush from "jsr:@negrel/webpush@0.5.0";

const vapidKeys = await webpush.generateVapidKeys();
const exportedKeys = await webpush.exportVapidKeys(vapidKeys);
const applicationServerKey = await webpush.exportApplicationServerKey(vapidKeys);

console.log(JSON.stringify({
  applicationServerKey,
  vapidKeys: exportedKeys
}, null, 2));