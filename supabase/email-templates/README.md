# Șabloane de autentificare în română

Aceste fișiere se copiază în proiectul Supabase existent, la Authentication →
Emails → șablonul dorit → Body → Source. Publicarea lor în GitHub/Vercel nu
modifică automat configurația Supabase găzduită.

| Șablon Supabase | Subject | Body |
| --- | --- | --- |
| Reset password | Resetează parola | reset-password.html |
| Confirm sign up | Confirmă adresa de e-mail | confirm-signup.html |

Păstrați `{{ .ConfirmationURL }}` exact așa: Supabase construiește linkul de
verificare cu tokenul și destinația autorizată. Adresa simplă a paginii de
resetare nu înlocuiește acest link.

Sender email: contact@urmatoarea-proprietate.ro. Sender name: Următoarea
Proprietate. Site URL și Redirect URLs se configurează separat conform ghidului
`docs/DOMAIN-MIGRATION.md`. Salvați fiecare șablon în Supabase. Setările se aplică
mesajelor noi; e-mailurile deja primite își păstrează textul original. Nu este
necesar un redeploy Vercel pentru schimbarea unui șablon în Supabase.

La test, folosiți adresa unui cont propriu existent. Verificați expeditorul,
textul și domeniul paginii deschise după apăsarea linkului. Nu distribuiți tokenul
sau linkul complet de recuperare.
