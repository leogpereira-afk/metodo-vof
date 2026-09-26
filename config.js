// ============================================================================
// config.js: endereço do backend do Método V.O.F.
//
// PONTO ÚNICO DE SAÍDA: o resto do app chama STORE.apiFn() e não sabe onde o
// backend mora. Trocar de servidor é trocar estas duas linhas.
//
// NÃO existe token aqui, e nunca vai existir. O repositório é PÚBLICO (o
// GitHub Pages grátis exige): tudo o que está neste arquivo está publicado.
// Quatro sistemas da casa já autorizaram por um segredo guardado no config.js
// e o login virou enfeite. Quem autoriza é o CRACHÁ da pessoa, guardado no
// localStorage depois do login (ou plantado pela entrada única do Painel).
// ============================================================================
window.API_BASE = "https://heveemylixartyijxewh.supabase.co/functions/v1";
window.API_FN = { sync: "vof-sync" };
