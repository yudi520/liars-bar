const puppeteer = require('puppeteer');

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  // Set viewport to mobile landscape (matching modern smartphone ~20:9 landscape CSS dimensions)
  await page.setViewport({ width: 840, height: 380, deviceScaleFactor: 2 });

  console.log('Navigating to Liars Bar...');
  await page.goto('http://localhost:9527', { waitUntil: 'networkidle2' });

  // 1. Test Liars Deck Mode (Lobby)
  console.log('Creating Liar Deck room...');
  // Select Liar's Deck
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mode-card'));
    const deckCard = cards.find(c => c.textContent.includes('骗子纸牌'));
    if (deckCard) deckCard.click();
  });
  await new Promise(r => setTimeout(r, 400));
  
  // Click Create Room
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('创建房间'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/37af1087-27a7-49b4-a57f-213a565786e6/screen_deck_lobby.png' });
  console.log('Saved screen_deck_lobby.png');

  // Add bot and start game
  await page.evaluate(() => {
    const botBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('邀请电脑'));
    if (botBtn) botBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('开始恶魔纸牌局'));
    if (startBtn) startBtn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/37af1087-27a7-49b4-a57f-213a565786e6/screen_deck_game.png' });
  console.log('Saved screen_deck_game.png');

  // 2. Test Liars Dice Mode (Lobby & Game)
  console.log('Creating Liar Dice room...');
  await page.goto('http://localhost:9527', { waitUntil: 'networkidle2' });

  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mode-card'));
    const diceCard = cards.find(c => c.textContent.includes('骗子骰子'));
    if (diceCard) diceCard.click();
  });
  await new Promise(r => setTimeout(r, 400));

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('创建房间'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/37af1087-27a7-49b4-a57f-213a565786e6/screen_dice_lobby.png' });
  console.log('Saved screen_dice_lobby.png');

  // Add bot and start game in Dice mode
  await page.evaluate(() => {
    const botBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('添加人机'));
    if (botBtn) botBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('开始对局'));
    if (startBtn) startBtn.click();
  });
  await new Promise(r => setTimeout(r, 1800));

  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/37af1087-27a7-49b4-a57f-213a565786e6/screen_dice_game.png' });
  console.log('Saved screen_dice_game.png');

  await browser.close();
  console.log('Done test!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
