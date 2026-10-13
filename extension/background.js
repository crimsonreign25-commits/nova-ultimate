const NOVA_URL='https://nova-ultimate-8scp.onrender.com/';
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:NOVA_URL}));
