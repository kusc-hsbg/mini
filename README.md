# 🏙️ PixelTown — 게더타운 클론 (풀버전)

아바타로 돌아다니고, **카트 레이스와 피아노 연주**를 하고, 회의실을 잠그고,
화이트보드에 함께 그리는 **맵 기반 온라인 오피스**.
Next.js + Supabase(무료 티어)로 **GitHub → Vercel** 무료 배포가 가능합니다.

> **Supabase 없이도** 바로 실행됩니다 — 그 경우 자동으로 **싱글플레이 데모 모드**로 동작합니다.

---

## ✨ 기능 전체 목록

### 공간 구조 (Space → Room → Tile → Object)
- **스페이스**: 고유 URL(`/s/slug`) 보유, 여러 개의 방(맵) 포함 (생성 시 5개 맵 자동 생성)
- **대형 프리셋 맵 5종** (80×50급): 타운 스퀘어 · 픽셀 오피스 · 선셋 파크 · 그랑프리 서킷(카트 레이싱) · 비치 리조트
- 32px 타일 기반, 오브젝트 레이어, 전경(나무 캐노피/램프 글로우) 레이어, 미니맵(M), 줌

### 아바타·이동
- 커스터마이즈: 피부톤 · 헤어 7종 · 머리색 · 상의/하의 색 · 모자 7종 · 표정 6종 (걷기 애니메이션 픽셀아트)
- **특별 헤어 스타일 12종** — 일러스트 이미지 머리(남 6/여 6), 픽셀 몸과 합성 렌더
- WASD/방향키 + **더블클릭 자동 이동(A\* 경로탐색)** + X키 상호작용 + F 오토바이(2배속)
- 상태(대화 가능/바쁨/방해 금지 + 상태 메시지), 이모지(1~0), 참가자 패널
- **의자/소파/벤치 앉기(X 키)** — 앉은 모습이 모두에게 보임, 이동 키로 일어남
- 커피머신·자판기 상호작용(아이템 이모트), Z 키 춤
- **Follow(따라가기) / 이동(Join in click) / Wave(손 흔들기)**

### 소셜·인터랙션
- **손들기**, 이모지 반응, 말풍선 채팅(머리 위 표시)
- **라운지 피아노 연주** — 건반/키보드로 연주, 근처 사람에게도 실시간 재생
- **그랑프리 레이싱 아이템**: ? 박스(터보/부스트/슬로우 랜덤), 기름 웅덩이(미끄러짐)

### 회의실·프라이빗 영역
- 영역 안 사람끼리만 대화/영역 채팅, 외부 화면 어두워짐
- **최대 인원 제한**(가득 차면 진입 불가), **잠금 + 노크 → 승인/거절**, **영역 초대 링크**

### 캘린더·일정
- 내부 회의 예약(위치: 회의 영역/내 데스크/스폰), 참여 버튼 = 위치로 순간이동
- **.ics 내보내기** → Google/Outlook 캘린더로 가져오기, 회의 중 **자동 Busy 상태**
- ※ Google Calendar API 직접 연동은 외부 API라 .ics 방식으로 대체했습니다

### 맵 제작 (Build Tool + Mapmaker)
- 인게임 에디터(권한: Admin/Moderator/Mapmaker): 타일 16종 드래그 페인팅, 오브젝트 26종 배치
- 효과: 통과불가(벽) · **스폰** · **포털** · **프라이빗 영역(드래그)** · **스포트라이트** · 텍스트 라벨
- **박스 선택 일괄 삭제, Ctrl+Z 실행취소, 템플릿 초기화**, 저장 시 모두에게 실시간 적용
- 커스텀 오브젝트(이미지 URL 업로드)

### 포털
- 같은 방 순간이동 / 같은 스페이스 다른 방 / **다른 스페이스**(slug)
- 문 오브젝트 표시, **비밀번호 문**, **멤버 전용 문**

### 오브젝트 상호작용
- 웹사이트 임베드 · 이미지 · 영상(YouTube/Vimeo/Twitch) · 외부 회의(Zoom/Meet/Teams 링크)
- 노트 · **화이트보드** · **게시판** · 외부 게임 임베드 · **테트리스(내장 게임)** · 사운드(근접 볼륨) · Spotify 임베드

### 화이트보드
- 실시간 공동 드로잉(펜/지우개/텍스트), Supabase 영속화, **PNG 내보내기**, **공유 URL**(`/wb/키`) 단독 페이지

### 권한·역할
- Admin / Moderator / Mapmaker / Member + 게스트(비로그인), 설정에서 역할 관리

### 보안·접근 제한
- **스페이스 비밀번호**(bcrypt 해시), **로그인 필수**, **이메일 도메인 제한**
- **게스트 체크인**(입장 요청 → 접속 중인 멤버 승인) + **게스트 로그**

### 모더레이션
- 뮤트(강제 음소거) · 킥 · **밴/밴 해제** · 개인 차단(Block, 대화·연결 차단)

### 상태·프레즌스
- 상태 3종 + 커스텀 메시지, 회의 자동 Busy, Wave over, 클릭 한 번으로 상대에게 이동

### 데스크
- **자리 지정**(오피스 24석) + 명판 표시, 꾸미기(러그 색/화분), **쪽지·선물 남기기**(비동기) + 쪽지함

### 분석 (Insights)
- 활성 사용자, 최대 동시 접속, 대화 시간, 채팅 수, 일별 차트, 멤버별 활동 테이블, **CSV 내보내기**

---

## 🎮 조작법

| 키 | 동작 |
|---|---|
| `WASD` / 방향키 | 이동 |
| 더블클릭 | 자동 이동 (경로탐색) |
| `X` | 오브젝트 상호작용 |
| `1`~`0` | 이모지 |
| `F` | 오토바이 탑승/하차 (거치대에서) |
| `M` | 미니맵 토글 |
| 다른 플레이어 클릭 | 참가자 패널 |

---

## 🚀 빠른 시작 (로컬)

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속. `.env.local`이 비어 있으면 **데모 모드**로 실행됩니다.

> ⚠️ 일부 Windows 환경에서는 3000 포트를 시스템 서비스가 점유해 빈 화면이 나올 수 있습니다.
> 그 경우 `npm run dev -- -p 3210` 처럼 다른 포트를 사용하세요.

---

## 🗄️ Supabase 설정 (무료 플랜으로 충분)

### 1. 프로젝트 생성
[supabase.com](https://supabase.com) → **New Project** (Free 플랜).

### 2. 스키마 적용
대시보드 **SQL Editor** → `supabase/schema.sql` **전체 내용**을 붙여넣고 **Run**.
(프로필/스페이스/멤버/방/데스크/회의/게시판/화이트보드/밴/분석 등 14개 테이블 + RLS + RPC 생성.
여러 번 실행해도 안전합니다.)

### 3. 환경변수
**Settings → API**에서 복사해 `.env.local`에 입력:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
NEXT_PUBLIC_SITE_URL=                 # 로컬은 비워둠
```

### 4. Google OAuth
1. [Google Cloud Console](https://console.cloud.google.com/) → **API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹)** 생성
2. **승인된 리디렉션 URI**에 추가: `https://<프로젝트>.supabase.co/auth/v1/callback`
3. 생성된 **클라이언트 ID/시크릿**을 Supabase **Authentication → Providers → Google**에 입력 후 활성화
4. Supabase **Authentication → URL Configuration**:
   - **Site URL**: 배포 도메인 (`https://your-app.vercel.app`)
   - **Redirect URLs**: `https://your-app.vercel.app/**` 와 `http://localhost:3000/**` 추가

### 5. Realtime
별도 설정 불필요 — 채널 기반 presence/broadcast만 사용하므로 Replication 설정이 필요 없습니다.
(무료 티어: 동시 접속 200명, 월 200만 메시지)

---

## ☁️ GitHub → Vercel 배포

```bash
git init
git add .
git commit -m "PixelTown"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

1. [vercel.com](https://vercel.com) → **Import Git Repository** → 이 저장소 선택
2. **Environment Variables** 3개 추가:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://your-app.vercel.app`
3. **Deploy**
4. 배포 후 Supabase **URL Configuration**의 Site URL / Redirect URLs에 실제 Vercel 도메인 반영 확인

> Vercel은 상시 WebSocket 서버를 띄울 수 없으므로
> **위치/채팅/이벤트 동기화**는 Supabase Realtime(매니지드 WebSocket)을 사용합니다.

---

## 🏗️ 아키텍처

```
Next.js (App Router) ── Vercel
│
├─ src/app
│   ├─ /spaces                 로비 (스페이스 목록/생성)
│   ├─ /s/[spaceId]            게이트 (비밀번호/체크인/도메인/밴 검사)
│   ├─ /s/[spaceId]/[roomId]   게임 화면
│   ├─ /s/[spaceId]/settings   설정 (멤버/역할/보안/방/밴/게스트로그)
│   ├─ /s/[spaceId]/insights   분석
│   ├─ /wb/[key]               화이트보드 공유 페이지
│   └─ actions.ts              서버 액션 (모든 DB 쓰기)
│
├─ src/lib/game     엔진 · 맵(프리셋/빌더) · 스프라이트 · A* · 오브젝트 카탈로그
├─ src/hooks        useRoomChannel(Realtime) · useControlChannel(체크인)
├─ src/components/game  GameClient + 패널/모달/에디터/테트리스/화이트보드
└─ supabase/schema.sql  전체 스키마 + RLS + RPC
```

- **렌더링**: HTML5 Canvas, 외부 이미지 에셋 0개 (전부 코드로 그린 픽셀아트).
  바닥 타일은 오프스크린 캔버스에 미리 렌더해 대형 맵에서도 60fps.
- **이동 동기화**: 상태 변경 시에만 broadcast(80ms 스로틀) + 보간.
  **presence**로 접속자/상태 동기화, 채널 조인 실패 시 자동 재접속.

---

## 🗺️ 맵 수정/추가

- **인게임 에디터**(🛠️ 버튼, Admin/Mapmaker): 저장하면 `rooms.map_data`(jsonb)에 기록되고 모두에게 즉시 적용.
- **프리셋 추가**: `src/lib/game/presets.ts`에서 빌더 함수로 새 맵을 만들고 `PRESET_MAPS`에 등록.
- **오브젝트 종류 추가**: `src/lib/game/objects.ts`(카탈로그) + `src/lib/game/sprites.ts`(렌더 함수).
