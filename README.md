# LLM Effort 비교 실험 — tetris (React + TypeScript)

**Reasoning effort low / high / max가 같은 코딩 태스크의 결과물에 어떤 차이를 만드는가** — 단일 프롬프트, 단일 모델, 조건별 n=1의 실측 기록.

**원본 프롬프트 (verbatim)**: `tetris game 을 html 로 구성하고 react 를 이용하고 typescript 를 사용해라.` — 전체 프로토콜은 [prompt/PROMPT.md](prompt/PROMPT.md)

> 모델: 자체 호스팅 오픈웨이트 원모델 단발 호출 (서빙 alias `dgx-local`, 온프레미스, 네트워크 정보 비공개). 2026-10-09~10 실측.

## 결과 요약

| | low | high | max |
| --- | --- | --- | --- |
| **빌드 (vite)** | ✅ 통과 | ✅ 통과 | ✅ 통과 |
| **tsc --noEmit 에러** | 6건 | **3건** (최소) | 19건 |
| **기능 체크리스트** | 9/9 | 9/9 | 9/9 |
| **추론 토큰** | 25,006 | 24,827 | **39,860** |
| **총 생성 토큰** | 37,221 | 34,426 | 51,746 |
| **총 소요** | 2,356.7초 | 2,530.4초 | 2,965.2초 |
| **첫 콘텐츠까지** | 1,815.9초 | 2,128.6초 | 2,693.7초 |
| **TTFT** | 0.088초 | 0.018초 | 0.017초 |
| **답변 길이** | 34,790자 | 27,671자 | 33,184자 |
| **코드 분량** | 618줄 | 447줄 | 561줄 |

기능 체크리스트: 조작키·회전·하드드롭·소프트드롭·줄삭제·점수·레벨·게임오버·일시정지 (3조건 모두 9/9 완성)

## 결론

1. **동작 완성도는 effort와 무관** — 3조건 모두 9/9 기능을 구현하고 빌드 통과. effort를 올린다고 기능이 더 완성되지 않는다.
2. **코드 품질은 high가 최적** — tsc 에러 최소(3건, UMD 패턴 관련) + 유일하게 `useReducer` 상태 머신 채택. low는 중간(6건), max는 최다(19건).
3. **max의 실패 양상**: 구현 의도는 가장 정교하지만 다차원 배열 타입 선언 불일치(TS2345 10건)에 집중 — 정교함과 타입 정합성은 별개였다.
4. **effort→추론 토큰은 max에서만 뚜렷** — low 25,006 ≈ high 24,827 << max 39,860. 이 태스크에서 effort 상승이 추론을 늘리는 건 max뿐이었다.
5. **시간 비용은 effort에 비례** — low→max 총 소요 +26%. TTFT는 3조건 모두 0.1초 미만으로 스트리밍 자체는 즉각.
6. **분량과 품질은 무상관** — 코드 618줄(low) > 561줄(max) > 447줄(high)이면서 품질 역순.

## 데모 (GitHub Pages)

- [low](https://plainoldcode.github.io/llm-effort-tetris/low/)
- [high](https://plainoldcode.github.io/llm-effort-tetris/high/)
- [max](https://plainoldcode.github.io/llm-effort-tetris/max/)

각 조건의 응답에서 추출한 동일 프로젝트(`src/main.tsx`)를 `--base=./`로 재빌드한 것 — 구현물 소스는 `implementations/`.

## 저장소 구조

```
prompt/PROMPT.md              원본 프롬프트 + 실행 조건 + max_tokens 파일럿 경위
implementations/{low,high,max}/  응답에서 추출한 Vite+React+TS 프로젝트 (src/main.tsx)
raw/{low,high,max}_raw_response.md  모델 원시 응답 전문 (단일 HTML 코드펜스)
results/metrics_main.json     본선 실측 메트릭 (기계 판독)
results/metrics_pilot_cap32k.json  max_tokens=32768 파일럿 메트릭
evidence/{low,high,max}/      tsc/vite 출력 + 추출 메타 + 검증 JSON
docs/{low,high,max}/          Pages용 빌드 (base=./)
```

## 방법론 한계

- **n=1** — 조건당 1회 실행. 개별 실행 편차가 있을 수 있고, 통계적 주장이 아니라 **관측 기록**이다.
- 다만 저노이즈 신호는 있음: low의 추론 토큰이 파일럿/본선 모두 25,006으로 동일.
- 동일 태스크의 에이전트 게이트웨이 경유 실험(실험#1)과는 조건이 달라 절대 수치 직접 비교 불가 — 본 기록은 **원모델 단발 기준 effort 상대 비교** 전용.
- GPU 공유 환경 실측 — 응답시간에 타 워크로드 간섭 가능.
- 응답 파싱(HTML 펜스 → main.tsx 분리)은 사람이 설계한 고정 절차이며 3조건 동일 적용.

## 재현

```bash
cd implementations/high
npm install
npm run build      # dist/ 생성
npx tsc --noEmit   # evidence/의 tsc_output.txt와 동일 절차
```

## 출처

- 내부 추적: TT 카드 M4GB403A-E4XC ([실험#2] coding task effort 비교 — 2026-10-09~10)
- 원시 데이터: `results/`, `raw/` — 본 README의 모든 수치는 기계 판독 JSON에서 가져옴
