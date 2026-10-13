// Non-invasive browser bridge: adds a keyboard shortcut that opens NOVA without modifying page content.
window.addEventListener('keydown',e=>{
  if(e.altKey && e.shiftKey && e.key.toLowerCase()==='n'){
    e.preventDefault(); window.open('https://nova-ultimate-8scp.onrender.com/','_blank','noopener');
  }
});
