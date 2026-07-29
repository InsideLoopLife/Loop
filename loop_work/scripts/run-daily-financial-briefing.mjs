const base=(process.env.APP_BASE_URL||"").replace(/\/$/,"");
const secret=process.env.CRON_SECRET||"";
if(!base||!secret) throw new Error("APP_BASE_URL and CRON_SECRET are required");
const response=await fetch(`${base}/api/cron/daily-financial-briefing`,{headers:{authorization:`Bearer ${secret}`}});
const text=await response.text(); console.log(text); if(!response.ok) process.exit(1);
