/**
 * 항로 구간(Leg) 배지 텍스트 조합 순수 함수 서비스
 * - 지도에 표시되는 구간 배지의 소요시간(분)과 거리(NM) 온오프 조합을 일관되게 생성합니다.
 */

export interface RouteLegLabelParts {
  durationText: string | null;
  distanceText: string | null;
  combinedText: string;
  isHidden: boolean;
}

export function getRouteLegLabelParts(
  durationMinutes: number,
  distanceNm: number,
  showDuration = true,
  showDistance = true,
): RouteLegLabelParts {
  const safeMins = Number.isFinite(durationMinutes)
    ? Math.max(0, Math.round(durationMinutes))
    : 0;
  const safeNm = Number.isFinite(distanceNm) ? Math.max(0, distanceNm) : 0;

  const durationText = showDuration ? `${safeMins}분` : null;
  const distanceText = showDistance ? `${safeNm.toFixed(1)}NM` : null;

  const parts = [durationText, distanceText].filter(
    (item): item is string => item !== null,
  );

  return {
    durationText,
    distanceText,
    combinedText: parts.join(' · '),
    isHidden: parts.length === 0,
  };
}
