# -*- coding: utf-8 -*-
"""
Generate a high-resolution, ultra-crisp Mindmap Infographic image for:
[Retail Jewelry & Goldsmith Store Model (소매 주얼리 & 금은방 롤링 시스템)]
Saved as '골드랩_소매주얼리_롤링마인드맵.png'.
"""

import os
import shutil
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 2200
HEIGHT = 1350

# Colors
BG_COLOR = (11, 15, 25)            # Deep navy background #0B0F19
CARD_BG = (22, 31, 48)             # Slate card #161F30
CARD_BORDER = (45, 59, 85)         # Subtle border
GOLD_BORDER = (212, 175, 55)       # Luxury Gold #D4AF37
GOLD_ACCENT = (245, 158, 11)       # Bright gold
GREEN_PROFIT = (16, 185, 129)      # Emerald profit #10B981
GREEN_BG = (6, 78, 59)             # Dark green fill
RED_LOSS = (244, 63, 94)           # Coral red #F43F5E
RED_BG = (76, 29, 36)              # Dark red fill
BLUE_CYAN = (56, 189, 248)         # Cyan process #38BDF8
PURPLE_AGENT = (168, 85, 247)      # Purple agent #A855F7
TEXT_WHITE = (248, 250, 252)       # Slate 50
TEXT_MUTED = (148, 163, 184)       # Slate 400
TEXT_SUB = (203, 213, 225)         # Slate 300

# Fonts
font_title = ImageFont.truetype("malgunbd.ttf", 44)
font_subtitle = ImageFont.truetype("malgun.ttf", 22)
font_h1 = ImageFont.truetype("malgunbd.ttf", 25)
font_h2 = ImageFont.truetype("malgunbd.ttf", 21)
font_body = ImageFont.truetype("malgun.ttf", 18)
font_body_bold = ImageFont.truetype("malgunbd.ttf", 18)
font_small = ImageFont.truetype("malgun.ttf", 15)
font_badge = ImageFont.truetype("malgunbd.ttf", 16)

img = Image.new("RGBA", (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(img)

def draw_card(box, fill, outline, width=2, radius=16):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def draw_badge(x, y, text, bg_color, text_color, font=font_badge):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x, pad_y = 12, 6
    box = [x, y, x + tw + pad_x*2, y + th + pad_y*2]
    draw.rounded_rectangle(box, radius=8, fill=bg_color)
    draw.text((x + pad_x, y + pad_y - 2), text, fill=text_color, font=font)
    return box

def draw_curve(p1, p2, color, width=3):
    x1, y1 = p1
    x2, y2 = p2
    cx1 = (x1 + x2) // 2
    cy1 = y1
    cx2 = (x1 + x2) // 2
    cy2 = y2
    steps = 40
    points = []
    for i in range(steps + 1):
        t = i / steps
        x = (1-t)**3 * x1 + 3*(1-t)**2 * t * cx1 + 3*(1-t) * t**2 * cx2 + t**3 * x2
        y = (1-t)**3 * y1 + 3*(1-t)**2 * t * cy1 + 3*(1-t) * t**2 * cy2 + t**3 * y2
        points.append((x, y))
    for i in range(len(points) - 1):
        draw.line([points[i], points[i+1]], fill=color, width=width)

# -------------------------------------------------------------
# 1. TOP HEADER BANNER
# -------------------------------------------------------------
draw.text((WIDTH//2, 50), "👑 골드랩(GOLD LAB) 소매 주얼리 & 금은방 롤링 시스템", fill=GOLD_BORDER, font=font_title, anchor="mm")
draw.text((WIDTH//2, 105), "14K·18K 주얼리 마진(40%)과 세공비 콤프깡으로 손님은 10% 더 받고, 사장은 현금 지출 없이 30만원 순이익!", fill=TEXT_MUTED, font=font_subtitle, anchor="mm")

# -------------------------------------------------------------
# 2. CENTRAL ROOT NODE (The Core Trigger)
# -------------------------------------------------------------
rx1, ry1, rx2, ry2 = 100, 360, 620, 600
draw_card([rx1, ry1, rx2, ry2], fill=CARD_BG, outline=GOLD_BORDER, width=3, radius=18)
draw_badge(rx1 + 25, ry1 + 20, "STEP 1. 시작 (소매 매입 입구)", bg_color=(88, 64, 16), text_color=GOLD_BORDER)

draw.text((rx1 + 25, ry1 + 65), "손님이 헌 금(14K/18K/잡금)\n100만원어치 팔러 왔을 때", fill=TEXT_WHITE, font=font_h1)

# Choice A: Red (Bad)
cax1, cay1, cax2, cay2 = rx1 + 25, ry1 + 135, rx2 - 25, ry1 + 185
draw.rounded_rectangle([cax1, cay1, cax2, cay2], radius=8, fill=RED_BG, outline=RED_LOSS, width=1)
draw.text((cax1 + 15, cay1 + 14), "❌ 일반 금은방: 현금 100만원 지급 (손님 퇴장, 돈 유출)", fill=(254, 205, 211), font=font_body_bold)

# Choice B: Green/Gold (Good)
cbx1, cby1, cbx2, cby2 = rx1 + 25, ry1 + 195, rx2 - 25, ry1 + 250
draw.rounded_rectangle([cbx1, cby1, cbx2, cby2], radius=8, fill=(30, 41, 59), outline=GOLD_ACCENT, width=2)
draw.text((cbx1 + 15, cby1 + 14), "✨ 골드랩 제안: [110만원 교환권] 지급 (가게에 돈 묶임!)", fill=GOLD_ACCENT, font=font_body_bold)

start_pt = (rx2, (ry1 + ry2) // 2 + 10)
target_top = (780, 350)
target_bot = (780, 690)
draw_curve(start_pt, target_top, GOLD_BORDER, width=3)
draw_curve(start_pt, target_bot, BLUE_CYAN, width=3)

# -------------------------------------------------------------
# 3. BRANCH A: 14K / 18K 주얼리 선택 (The Profit Cash-Cow)
# -------------------------------------------------------------
bx1, by1, bx2, by2 = 780, 190, 1420, 520
draw_card([bx1, by1, bx2, by2], fill=CARD_BG, outline=GREEN_PROFIT, width=3, radius=18)
draw_badge(bx1 + 25, by1 + 20, "STEP 2-A. 주얼리 선택 (마진 40%)", bg_color=GREEN_BG, text_color=(167, 243, 208))
draw.text((bx1 + 320, by1 + 23), "★ 최고 마진 핵심 구간!", fill=GREEN_PROFIT, font=font_body_bold)

draw.text((bx1 + 25, by1 + 65), "손님이 110만원 교환권으로 '18K 목걸이' 구매", fill=TEXT_WHITE, font=font_h1)
draw.line([(bx1 + 25, by1 + 108), (bx2 - 25, by1 + 108)], fill=CARD_BORDER, width=1)

draw.text((bx1 + 25, by1 + 125), "• 손님 심리 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 125), "\"10만원 꽁돈 벌어서 예쁜 목걸이 샀다!\" (대만족)", fill=TEXT_WHITE, font=font_body)

draw.text((bx1 + 25, by1 + 165), "• 사장 원가 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 165), "금 원가 60만원 + 공장 공임비 10만원 = 총 70만원", fill=TEXT_SUB, font=font_body)

draw.text((bx1 + 25, by1 + 205), "• 실제 정산 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((bx1 + 140, by1 + 205), "손님 금(100만) - 목걸이 원가(70만) = 순마진 30만", fill=TEXT_SUB, font=font_body)

pbox1 = [bx1 + 25, by1 + 245, bx2 - 25, by1 + 305]
draw.rounded_rectangle(pbox1, radius=10, fill=GREEN_BG, outline=GREEN_PROFIT, width=2)
draw.text((pbox1[0] + 20, pbox1[1] + 16), "💰 사장의 결과 : 현금 지출 0원 + 【+30만원 현금 순이익 달성】", fill=(209, 250, 229), font=font_h2)

# -------------------------------------------------------------
# 4. BRANCH B: 24K 순금 골드바 선택 (The Defensive Safe-Turn)
# -------------------------------------------------------------
cx1, cy1, cx2, cy2 = 780, 560, 1420, 890
draw_card([cx1, cy1, cx2, cy2], fill=CARD_BG, outline=BLUE_CYAN, width=3, radius=18)
draw_badge(cx1 + 25, cy1 + 20, "STEP 2-B. 순금 골드바 선택 (마진 1%)", bg_color=(12, 74, 110), text_color=(186, 230, 253))
draw.text((cx1 + 360, cy1 + 23), "★ 수수료 면제 방어 구간!", fill=BLUE_CYAN, font=font_body_bold)

draw.text((cx1 + 25, cy1 + 65), "손님이 \"난 목걸이 말고, 24K 골드바로 주세요\" 할 때", fill=TEXT_WHITE, font=font_h1)
draw.line([(cx1 + 25, cy1 + 108), (cx2 - 25, cy1 + 108)], fill=CARD_BORDER, width=1)

draw.text((cx1 + 25, cy1 + 125), "• 대응 전략 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 125), "10% 보너스 대신 【중간 매매 수수료 30만원 전액 면제】 제안", fill=GOLD_ACCENT, font=font_body_bold)

draw.text((cx1 + 25, cy1 + 165), "• 손님 심리 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 165), "\"다른 금은방 가면 30만원 까이는데 여긴 공짜로 바꿔주네!\"", fill=TEXT_WHITE, font=font_body)

draw.text((cx1 + 25, cy1 + 205), "• 숨은 마진 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((cx1 + 140, cy1 + 205), "가져온 헌 금 정련 차익(8만) + 골드바 제작 공임비(2만)", fill=TEXT_SUB, font=font_body)

pbox2 = [cx1 + 25, cy1 + 245, cx2 - 25, cy1 + 305]
draw.rounded_rectangle(pbox2, radius=10, fill=(15, 43, 70), outline=BLUE_CYAN, width=2)
draw.text((pbox2[0] + 20, pbox2[1] + 16), "🛡️ 사장의 결과 : 100% 본전 방어 + 【+10만원 안전 마진 확보】", fill=(224, 242, 254), font=font_h2)

# -------------------------------------------------------------
# 5. BOTTOM LEFT: 3대 안전장치 (Why It NEVER Fails)
# -------------------------------------------------------------
sx1, sy1, sx2, sy2 = 100, 680, 620, 1270
draw_card([sx1, sy1, sx2, sy2], fill=CARD_BG, outline=CARD_BORDER, width=2, radius=18)
draw_badge(sx1 + 25, sy1 + 20, "SAFETY NET. 3대 안전장치", bg_color=(51, 65, 85), text_color=(226, 232, 240))

draw.text((sx1 + 25, sy1 + 65), "사장이 절대 망하지 않는 비밀", fill=TEXT_WHITE, font=font_h1)
draw.line([(sx1 + 25, sy1 + 105), (sx2 - 25, sy1 + 105)], fill=CARD_BORDER, width=1)

shields = [
    ("🛡️ 1. 고금 매입 정련 차익 (8~12%)", 
     "손님에게 100만원 쳐준 헌 금은 종로 제련소 넘기면\n실제 108~112만원 가치로 현금화 (매입 단계에서 이미 이득)"),
    ("🏭 2. 종로 공장 공임 후려치기 (30%)", 
     "비수기 공장에 현금 선결제 ➔ 10만원 공임을 7만원으로 할인!\n세이브한 3만원이 사장님의 '순수 콤프 마진'이 됨"),
    ("➕ 3. 업셀링 (추가 현금 유도)", 
     "110만원 교환권을 쓰려고 150만원짜리 제품을 고름\n➔ 손님이 자기 지갑에서 추가 현금 40만원을 매장에 꽂아줌"),
    ("📉 4. 낙구(Breakage) 공짜 마진 (10%)", 
     "통계상 10~15% 손님은 포인트를 다 못 쓰거나 잊어버림\n➔ 쓰지 않고 남은 잔액은 사장의 100% 순수익")
]

cur_y = sy1 + 120
for s_title, s_desc in shields:
    draw.text((sx1 + 25, cur_y), s_title, fill=GOLD_BORDER, font=font_body_bold)
    cur_y += 28
    for line in s_desc.split("\n"):
        draw.text((sx1 + 45, cur_y), line, fill=TEXT_SUB, font=font_small)
        cur_y += 22
    cur_y += 18

# -------------------------------------------------------------
# 6. RIGHT SIDE: 외부 에이전트 영업 엔진 (Chamu-sik Comps)
# -------------------------------------------------------------
ax1, ay1, ax2, ay2 = 1500, 190, 2100, 890
draw_card([ax1, ay1, ax2, ay2], fill=CARD_BG, outline=PURPLE_AGENT, width=3, radius=18)
draw_badge(ax1 + 25, ay1 + 20, "STEP 3. 손님 몰고 오는 엔진 (차무식 콤프)", bg_color=(88, 28, 135), text_color=(233, 213, 255))

draw.text((ax1 + 25, ay1 + 65), "영업맨을 내 편으로 만드는 비결", fill=TEXT_WHITE, font=font_h1)
draw.line([(ax1 + 25, ay1 + 105), (ax2 - 25, ay1 + 105)], fill=CARD_BORDER, width=1)

draw.text((ax1 + 25, ay1 + 125), "• 에이전트 대상 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 155), "부자 만나는 부동산 공인중개사, 보험왕, 세무사", fill=TEXT_WHITE, font=font_body)

draw.text((ax1 + 25, ay1 + 205), "• 롤링 보상 룰 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 235), "손님이 금 1억원 살 때마다 에이전트에게\n【현금 100만원(1%) + 금 콤프 50만원】 즉시 꽂아줌", fill=PURPLE_AGENT, font=font_body_bold)

draw.text((ax1 + 25, ay1 + 305), "• 에이전트 심리 :", fill=TEXT_MUTED, font=font_body_bold)
draw.text((ax1 + 25, ay1 + 335), "\"다른 금은방 보내면 0원인데, 골드랩에 보내면\n현금도 벌고 금 포인트로 골드바도 모을 수 있네!\"", fill=TEXT_SUB, font=font_body)

abox = [ax1 + 25, ay1 + 430, ax2 - 25, ay1 + 660]
draw.rounded_rectangle(abox, radius=12, fill=(38, 20, 60), outline=PURPLE_AGENT, width=2)
draw.text((abox[0] + 20, abox[1] + 20), "🚀 폭발적인 시너지 결과 :", fill=(243, 232, 255), font=font_h2)
draw.text((abox[0] + 20, abox[1] + 65), "1. 사장이 발로 안 뛰어도 매일 큰손 유입\n2. 에이전트가 다른 금은방으로 배신 절대 안 함\n3. 콤프(금 포인트)로 에이전트까지 롤링에 묶임!", fill=TEXT_WHITE, font=font_body)

draw_curve((bx2, 350), (ax1, 350), PURPLE_AGENT, width=2)
draw_curve((cx2, 690), (ax1, 690), PURPLE_AGENT, width=2)

# -------------------------------------------------------------
# 7. BOTTOM FULL-WIDTH SUMMARY BANNER
# -------------------------------------------------------------
sum_x1, sum_y1, sum_x2, sum_y2 = 780, 940, 2100, 1270
draw_card([sum_x1, sum_y1, sum_x2, sum_y2], fill=(15, 23, 42), outline=GOLD_BORDER, width=2, radius=18)

draw_badge(sum_x1 + 30, sum_y1 + 25, "FINAL SUMMARY. 소매 주얼리 롤링 핵심 요약", bg_color=(88, 64, 16), text_color=GOLD_BORDER)
draw.text((sum_x1 + 30, sum_y1 + 75), "돈을 가게 밖으로 못 나가게 '교환권'으로 가두고, 마진 40% 주얼리로 녹여낸다!", fill=TEXT_WHITE, font=font_h1)

summary_steps = [
    ("1. 가두기", "손님이 금 팔러 왔을 때 현금 주지 말고 10% 더 얹어준 교환권을 줘서 매장 안에 묶는다."),
    ("2. 마진화", "손님이 18K 목걸이를 사면 원가 70만원 빼고 +30만원 순이익을 남긴다."),
    ("3. 수수료 방어", "손님이 순금 골드바를 원하면 10% 대신 '수수료 전액 면제'로 유도해 안전마진 10만원을 남긴다."),
    ("4. 외부 확장", "부동산·보험 에이전트에게 롤링 수수료를 줘서 부자 고객 유입을 완전 자동화한다.")
]

s_col1_x = sum_x1 + 30
s_col2_x = sum_x1 + 680
for idx, (stitle, sdesc) in enumerate(summary_steps):
    px = s_col1_x if idx < 2 else s_col2_x
    py = sum_y1 + 130 + (idx % 2) * 85
    draw.text((px, py), stitle, fill=GOLD_ACCENT, font=font_body_bold)
    draw.text((px, py + 26), sdesc, fill=TEXT_SUB, font=font_small)

# -------------------------------------------------------------
# 8. SAVE IMAGE
# -------------------------------------------------------------
BASE_DIR = r"c:\Users\WD\Desktop\작업용\ju\골드랩 작업"
out_workspace = os.path.join(BASE_DIR, "골드랩_소매주얼리_롤링마인드맵.png")
img.save(out_workspace, "PNG")

downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
out_downloads = os.path.join(downloads_dir, "골드랩_소매주얼리_롤링마인드맵.png")
try:
    shutil.copyfile(out_workspace, out_downloads)
except Exception as e:
    print(f"Downloads copy note: {e}")

print(f"Retail Mindmap created successfully:")
print(f"1. {out_workspace}")
print(f"2. {out_downloads}")
