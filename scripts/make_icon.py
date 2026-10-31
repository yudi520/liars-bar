import math
from PIL import Image, ImageDraw, ImageFont

def generate_icon(output_path="E:/others/app/liars-bar/icon.png"):
    size = 512
    img = Image.new("RGBA", (size, size), (15, 17, 24, 255))
    draw = ImageDraw.Draw(img)

    # 1. 绘制暗黑酒馆背景与同心圆光晕
    for r in range(256, 0, -4):
        alpha = int(30 * (1 - r / 256))
        draw.ellipse([256 - r, 256 - r, 256 + r, 256 + r], fill=(45, 30, 20, alpha))

    # 2. 外部华丽金框
    draw.rounded_rectangle([12, 12, 500, 500], radius=40, outline=(217, 119, 6), width=10)
    draw.rounded_rectangle([22, 22, 490, 490], radius=32, outline=(251, 191, 36), width=3)

    # 3. 绘制居中两张倾斜扑克牌 (A♠ 与 K♥)
    def create_card(val, suit, suit_color):
        cw, ch = 110, 160
        card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        cdraw = ImageDraw.Draw(card)
        cdraw.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=10, fill=(248, 250, 252), outline=(148, 163, 184), width=3)
        
        font_val = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)
        font_suit = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 36)
        
        cdraw.text((14, 10), val, fill=suit_color, font=font_val)
        cdraw.text((cw // 2 - 16, ch // 2 - 14), suit, fill=suit_color, font=font_suit)
        return card

    card_k = create_card("K", "♥", (225, 29, 72)).rotate(14, expand=True, resample=Image.BICUBIC)
    card_a = create_card("A", "♠", (15, 23, 42)).rotate(-14, expand=True, resample=Image.BICUBIC)

    img.paste(card_k, (160, 120), card_k)
    img.paste(card_a, (230, 120), card_a)

    # 4. 绘制 8 弹巢左轮转轮 (直径 190)
    cx, cy = 256, 230
    cr = 92
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(30, 34, 48), outline=(245, 158, 11), width=7)

    # 8 颗黄铜子弹孔
    orbit_r = 60
    bullet_r = 15
    for i in range(8):
        angle = math.radians(i * 45)
        bx = cx + orbit_r * math.cos(angle)
        by = cy + orbit_r * math.sin(angle)
        # 弹孔阴影
        draw.ellipse([bx - bullet_r, by - bullet_r, bx + bullet_r, by + bullet_r], fill=(12, 13, 18))
        # 黄铜底火
        draw.ellipse([bx - bullet_r + 3, by - bullet_r + 3, bx + bullet_r - 3, by + bullet_r - 3], fill=(251, 191, 36), outline=(180, 83, 9), width=2)
        # 底火撞击中心
        draw.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=(120, 53, 15))

    # 转轮中心轴
    draw.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=(217, 119, 6), outline=(251, 191, 36), width=2)
    draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(15, 17, 24))

    # 5. 文字排版
    font_en = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
    font_zh = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 50)
    font_sub = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 18)

    # 顶部: ★ LIAR'S BAR ★
    en_text = "★ LIAR'S BAR ★"
    bbox_en = draw.textbbox((0, 0), en_text, font=font_en)
    draw.text(((size - (bbox_en[2] - bbox_en[0])) // 2, 45), en_text, fill=(251, 191, 36), font=font_en)

    # 底部主标: 骗子酒馆
    zh_text = "骗子酒馆"
    bbox_zh = draw.textbbox((0, 0), zh_text, font=font_zh)
    draw.text(((size - (bbox_zh[2] - bbox_zh[0])) // 2, 355), zh_text, fill=(251, 191, 36), font=font_zh)

    # 底部副标: 德州扑克 · 8 弹生死局
    sub_text = "德州扑克 · 8 弹生死局"
    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_sub)
    draw.text(((size - (bbox_sub[2] - bbox_sub[0])) // 2, 435), sub_text, fill=(203, 213, 225), font=font_sub)

    img.save(output_path, "PNG")
    print("Generated new Liar's Bar icon at: " + output_path)

if __name__ == "__main__":
    generate_icon()
