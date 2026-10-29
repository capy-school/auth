// Fictional browser-only transport. Server contracts are exercised separately
// against a real, isolated Better Auth instance in account-auth.test.ts.
export const accountState = `
window.__calls=[];
window.__sessions=[{id:'current',token:'opaque-current-token',userAgent:'Chrome/120 Linux',createdAt:'2026-10-26T12:00:00Z'},{id:'other',token:'opaque-other-token',userAgent:'Firefox/120 Windows',createdAt:'2026-10-25T10:00:00Z'}];
window.__passkeys=[{id:'pk',name:'Portátil',createdAt:'2026-10-25'}];
window.__keys=[{id:'api',name:'<img src=x onerror=window.__xss=true>',start:'abc',enabled:true,createdAt:'2026-10-25'}];
window.__orgs=[{id:'org-a',name:'Equipo A',slug:'equipo-a'},{id:'org-b',name:'Equipo B',slug:'equipo-b'}];
window.__credential=true;window.__twoFactor=false;
window.__accountCall=async(method,arg={})=>{
  window.__calls.push({method,arg});
  if(window.__failMethod===method)return {data:null,error:{message:'Fallo de prueba. Vuelve a intentar.',status:500}};
  const ok=data=>({data,error:null});
  switch(method){
    case 'getSession':return ok({user:{id:'u',twoFactorEnabled:window.__twoFactor},session:{id:'current'}});
    case 'listSessions':return ok(window.__sessions);
    case 'revokeSession':window.__sessions=window.__sessions.filter(s=>s.token!==arg.token);return ok({status:true});
    case 'listAccounts':return ok(window.__credential?[{providerId:'credential'}]:[{providerId:'magic-link'}]);
    case 'passkey.listUserPasskeys':return ok(window.__passkeys);
    case 'passkey.addPasskey':window.__passkeys.push({id:'new',name:arg.name});return undefined;
    case 'passkey.updatePasskey':window.__passkeys.find(p=>p.id===arg.id).name=arg.name;return ok({status:true});
    case 'passkey.deletePasskey':window.__passkeys=window.__passkeys.filter(p=>p.id!==arg.id);return ok(null);
    case 'apiKey.list':return ok(window.__keys);
    case 'apiKey.create':window.__keys.push({id:'new-key',name:arg.name,enabled:true});return ok({key:'fictional-one-time-key'});
    case 'apiKey.delete':window.__keys=window.__keys.filter(k=>k.id!==arg.keyId);return ok({success:true});
    case 'twoFactor.enable':return ok({totpURI:'otpauth://totp/Login:test?secret=JBSWY3DPEHPK3PXP&issuer=Login',backupCodes:['fictional-backup-one','fictional-backup-two']});
    case 'twoFactor.verifyTotp':if(arg.code!=='123456')return {data:null,error:{message:'Invalid two factor cookie',code:'INVALID_TWO_FACTOR_COOKIE',status:401}};window.__twoFactor=true;return ok({status:true});
    case 'twoFactor.disable':window.__twoFactor=false;return ok({status:true});
    case 'organization.list':return ok(window.__orgs);
    case 'organization.create':window.__orgs.push({id:'org-new',...arg});return ok({id:'org-new',...arg});
    case 'organization.setActive':return ok({id:arg.organizationId});
    case 'organization.listMembers':return ok({members:[{id:'owner',role:'owner',user:{id:'u',name:'Tu cuenta',email:'alex@example.invalid'}},{id:'member-'+arg.query.organizationId,role:'member',user:{id:'member-user',name:'Miembro '+arg.query.organizationId,email:'member@example.invalid'}}]});
    case 'organization.listInvitations':return ok([{id:'inv-'+arg.query.organizationId,email:'invite@example.invalid',role:'member',status:'pending'}]);
    case 'organization.inviteMember':return ok({id:'sent'});
    case 'organization.removeMember':return ok({id:arg.memberIdOrEmail});
    case 'organization.cancelInvitation':return ok({id:arg.invitationId});
    default:throw new Error('Unexpected fixture method: '+method);
  }
};`;
