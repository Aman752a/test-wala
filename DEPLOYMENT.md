# Test Wala — Online Deployment

यह package same-origin frontend + Express API है। इसलिए `content://...` से index.html खोलने पर API काम नहीं करेगा। इसे Node server/hosting पर चलाना जरूरी है।

## Render पर deploy
1. GitHub में इस पूरे folder को repository में upload करें.
2. Render में New → Blueprint चुनें और repository connect करें.
3. `render.yaml` को detect होने दें.
4. Environment में `OWNER_EMAIL` = `amankeshri7585@gmail.com` रखें.
5. `OWNER_PASSWORD` = `Aman2004@#` रखें.
6. Deploy होने के बाद Render जो `https://...onrender.com` URL दे, वही website URL है.
7. URL खोलकर Owner Login और New Account दोनों test करें.

## Local test
```bash
npm install
npm start
```
फिर `http://localhost:3000` खोलें।

## Important
- सीधे `public/index.html` File Manager से न खोलें.
- Production में `JWT_SECRET` को लंबा random secret रखें.
- SQLite database `data/data.db` में है; hosting पर persistent disk/volume जरूरी है ताकि users/tests/results deployment restart के बाद भी रहें.
