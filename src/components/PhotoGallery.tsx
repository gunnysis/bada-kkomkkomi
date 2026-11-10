import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from 'lucide-react';
import {
  classifyDockingPhotoAsset,
  summarizePhotoCollection,
} from '../config/dataSources';

interface PhotoGalleryProps {
  photos: string[];
  pointName: string;
  pointId: string;
}

function resolveAssetUrl(rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const base = import.meta.env.BASE_URL || '/';
  const clean = rawPath.replace(/^\/+/, '');
  return `${base}${clean}`;
}

export function PhotoGallery({ photos, pointName, pointId }: PhotoGalleryProps) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const lightboxDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  const handleCloseExpanded = useCallback(() => {
    setExpandedPhoto(null);
  }, []);

  useEffect(() => {
    const dialog = lightboxDialogRef.current;
    if (!dialog) return;
    if (expandedPhoto && !dialog.open) {
      dialog.showModal();
    } else if (!expandedPhoto && dialog.open) {
      dialog.close();
    }
  }, [expandedPhoto]);

  // IntersectionObserver로 스냅된 슬라이드 인덱스를 모든 브라우저에서 정확히 추적
  useEffect(() => {
    const container = carouselRef.current;
    if (!container || photos.length <= 1) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-slide-index]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.slideIndex ?? 0);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '0px -45%',
        threshold: 0.1,
      },
    );

    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [photos, pointId]);

  const scrollToSlide = (targetIndex: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(photos.length - 1, targetIndex));
    const width = container.clientWidth;
    container.scrollTo({
      left: width * clamped,
      behavior: 'smooth',
    });
    setActiveIndex(clamped);
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-5 text-center">
        <Camera className="mx-auto mb-2 h-8 w-8 text-[#0066b3]" />
        <p className="text-base font-bold text-[#003360]">등록된 현장 사진이 없습니다</p>
        <p className="mt-1 text-xs text-slate-600">
          운영자 안내: <code className="font-bold text-[#0066b3]">public/images/docking/</code> 폴더에 사진을 추가하고{' '}
          <code className="font-bold text-[#0066b3]">docking_points.geojson</code>의{' '}
          <code className="font-bold text-[#00846c]">photos</code> 배열에 경로를 기입하세요.
        </p>
      </div>
    );
  }

  const collectionSummary = summarizePhotoCollection(photos);
  const activePhotoAsset = classifyDockingPhotoAsset(photos[activeIndex] ?? photos[0] ?? '');

  return (
    <section aria-label={`${pointName} 현장 사진 갤러리`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-[#0066b3]" aria-hidden="true" />
          <h3 className="text-base font-extrabold tracking-tight text-[#003360]">
            {collectionSummary.sectionTitle} ({activeIndex + 1} / {photos.length})
          </h3>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-[#003360]">
          좌우 스와이프 · 탭하여 확대
        </span>
      </div>

      <div className="relative">
        <div
          ref={carouselRef}
          className="bada-photo-carousel gap-3 rounded-2xl"
          role="region"
          aria-roledescription="carousel"
          aria-label="현장 접안 사진 슬라이드"
        >
          {photos.map((photoUrl, idx) => {
            const resolvedUrl = resolveAssetUrl(photoUrl);
            const isBroken = Boolean(failedUrls[photoUrl]);
            const assetMeta = classifyDockingPhotoAsset(photoUrl);
            return (
              <div
                key={`${pointId}-${photoUrl}-${idx}`}
                data-slide-index={idx}
                className="bada-photo-snap-item"
                role="group"
                aria-roledescription="slide"
                aria-label={`${photos.length}장 중 ${idx + 1}번째 사진`}
              >
                <div className="bada-photo-card relative aspect-16/10 w-full overflow-hidden rounded-2xl border-2 border-sky-200 bg-slate-900 shadow-sm">
                  {!isBroken ? (
                    <>
                      <img
                        src={resolvedUrl}
                        alt={`${pointName} ${assetMeta.isVectorDiagram ? '현장 이해용 모식도' : '현장 사진'} ${idx + 1}`}
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        className="h-full w-full object-cover"
                        onError={() =>
                          setFailedUrls((prev) => ({
                            ...prev,
                            [photoUrl]: true,
                          }))
                        }
                      />
                      <span
                        className={`pointer-events-none absolute top-2.5 left-2.5 rounded-xl border px-2.5 py-1 text-[11px] font-black shadow-md backdrop-blur-sm ${
                          assetMeta.isVectorDiagram
                            ? 'border-sky-200 bg-white/95 text-[#003360]'
                            : 'border-emerald-300 bg-emerald-950/90 text-emerald-100'
                        }`}
                      >
                        {assetMeta.badgeText}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedPhoto(resolvedUrl)}
                        aria-label={`${idx + 1}번 사진 전체화면 확대`}
                        className="absolute right-3 bottom-3 flex min-h-12 min-w-12 items-center gap-1.5 rounded-xl border border-sky-200 bg-white/95 px-3.5 py-2.5 text-xs font-extrabold text-[#003360] shadow-lg backdrop-blur-sm active:scale-95"
                      >
                        <Maximize2 className="h-4 w-4 text-[#0066b3]" />
                        <span>크게 보기</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center bg-sky-50 p-4 text-center">
                      <ImageOff className="mb-2 h-9 w-9 text-amber-600" />
                      <p className="text-sm font-bold text-[#003360]">이미지를 불러올 수 없습니다</p>
                      <p className="mt-1 break-all font-mono text-xs text-amber-700">{photoUrl}</p>
                      <p className="mt-2 text-xs text-slate-600">
                        파일명 대소문자 및 확장자(.jpg, .png, .svg)를 확인해주세요.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 장갑 착용 한 손 조작을 위한 48x48px 이상 좌/우 이동 버튼 */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="이전 사진"
              className="absolute top-1/2 left-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-sky-200 bg-white/95 text-[#003360] shadow-lg transition disabled:opacity-30 active:scale-90"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              disabled={activeIndex === photos.length - 1}
              aria-label="다음 사진"
              className="absolute top-1/2 right-2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-sky-200 bg-white/95 text-[#003360] shadow-lg transition disabled:opacity-30 active:scale-90"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {activePhotoAsset.isVectorDiagram && (
        <p className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-1.5 text-[11px] font-semibold leading-snug text-slate-700">
          ※ 오프라인 즉시 열람 및 수심·암초 위치 이해를 위해 자체 제작한 현장 모식도입니다. (실제 촬영 사진 등록 시 자동 표시)
        </p>
      )}

      {/* 하단 페이지 인디케이터 버튼 (터치 영역 확보) */}
      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {photos.map((photoUrl, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <button
                key={`dot-${photoUrl}-${idx}`}
                type="button"
                onClick={() => scrollToSlide(idx)}
                aria-label={`${idx + 1}번 사진으로 이동`}
                aria-current={isCurrent ? 'true' : undefined}
                className="flex h-8 min-w-8 items-center justify-center rounded-full px-1"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all ${
                    isCurrent ? 'w-8 bg-[#00846c]' : 'w-2.5 bg-slate-300'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* 전체화면 사진 확대 뷰어 (Native <dialog> Top-Layer) */}
      {expandedPhoto && (
        <dialog
          ref={lightboxDialogRef}
          data-photo-lightbox="true"
          aria-label={`${pointName} 현장 사진 확대 보기`}
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCloseExpanded();
          }}
          onClick={handleCloseExpanded}
          className="bada-modal-dialog fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none flex-col justify-between border-none bg-[#003360]/95 p-4 text-white backdrop-blur-md"
        >
          <div className="flex items-center justify-between pt-2">
            <span className="rounded-xl border border-white/25 bg-white/95 px-3.5 py-1.5 text-sm font-black text-[#003360] shadow-md">
              {pointId} · {pointName}
            </span>
            <button
              type="button"
              onClick={handleCloseExpanded}
              aria-label="확대 보기 닫기"
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-200 bg-white text-[#003360] shadow-md active:scale-95"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div
            className="my-auto flex max-h-[78dvh] items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={expandedPhoto}
              alt={`${pointName} 확대 이미지`}
              className="max-h-[75dvh] w-full rounded-xl bg-white/10 object-contain shadow-2xl"
            />
          </div>

          <p className="pb-2 text-center text-xs font-bold text-sky-100">
            화면을 탭하거나 우측 상단 닫기(X) 버튼을 누르면 돌아갑니다.
          </p>
        </dialog>
      )}
    </section>
  );
}
