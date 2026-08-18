// Diese Werte sind für Browser bestimmt. Hier niemals einen Secret-/Service-Role-Key
// oder das gemeinsame Zugangs-Passwort eintragen.
window.AUTOVALUE_CONFIG = Object.freeze({
  supabaseUrl: 'https://tyfscjaormfzerbjxzal.supabase.co',
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5ZnNjamFvcm1memVyYmp4emFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc5NTQsImV4cCI6MjEwMjU2Mzk1NH0.5_ItgzYRgLqB68LRR-0wFozwGIcYVutiLncWQDEcnX4',
  photoBucket: 'vehicle-photos',
  sharedAccessFunction: 'enter-shared-workspace',

  // Optional: auf '' lassen, bis die Edge Function `import-listing` bereitgestellt ist.
  listingImportFunction: '',
});
