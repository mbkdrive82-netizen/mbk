"use client";

import { memo, useCallback, useMemo, useRef } from "react";
import { EnvelopeIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { List } from "react-window";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { getDocumentStatusMeta } from "@/utils/trainerDocumentWorkflow";
import { failedImageUrls, markImageUrlFailed } from "@/utils/imageUtils";

const FULL_GRID_TEMPLATE =
  "96px minmax(240px,1.2fr) minmax(240px,1fr) minmax(220px,0.9fr) 184px";
const COMPACT_GRID_TEMPLATE = "96px minmax(260px,1.3fr) minmax(280px,1fr)";
const VIRTUAL_ROW_HEIGHT = 124;
const VIRTUAL_OVERSCAN = 4;
const MAX_TABLE_HEIGHT = 680;
const LOAD_MORE_TRIGGER_OFFSET = 5;

const TABLE_COLUMNS = [
  {
    id: "displayName",
    accessorKey: "displayName",
  },
  {
    id: "displayEmail",
    accessorKey: "displayEmail",
  },
  {
    id: "displayReference",
    accessorKey: "displayReference",
  },
  {
    id: "displayCity",
    accessorKey: "displayCity",
  },
  {
    id: "status",
    accessorFn: (row) => getDocumentStatusMeta(row.workflow.documentStatus).label,
  },
];

const VirtualizedTrainerRow = memo(function VirtualizedTrainerRow({
  index,
  style,
  rows,
  showStatusColumns,
  imageLoadError,
  onImageError,
  onRowClick,
  onRowHover,
  renderPrimaryAction,
  renderManagementButtons,
  getAccountStatusMeta,
  hasNextPage,
  isFetchingNextPage,
}) {
  const gridTemplateColumns = showStatusColumns
    ? FULL_GRID_TEMPLATE
    : COMPACT_GRID_TEMPLATE;
  const isLoaderRow = hasNextPage && index >= rows.length;

  if (isLoaderRow) {
    return (
      <div
        className="grid items-center border-b border-gray-100 bg-white"
        style={{ ...style, gridTemplateColumns }}
      >
        <div
          className="px-6 py-4 font-calibri text-xs font-bold uppercase tracking-widest text-gray-500"
          style={{ gridColumn: "1 / -1" }}
        >
          {isFetchingNextPage ? "Loading more trainers..." : "Scroll to load more trainers"}
        </div>
      </div>
    );
  }

  const rowModel = rows[index];
  if (!rowModel) {
    return null;
  }

  const row = rowModel.original;
  const statusMeta = getDocumentStatusMeta(row.workflow.documentStatus);
  const imageLoadErrorIndex = imageLoadError[row.id] || 0;
  // Pick the first candidate at/after the current index that hasn't already failed
  // this session. This prevents re-requesting dead URLs (404/blocked) every time a
  // virtualized row scrolls back into view.
  const candidateList = row.previewImageCandidates || [];
  let previewImage = null;
  for (let i = imageLoadErrorIndex; i < candidateList.length; i += 1) {
    if (!failedImageUrls.has(candidateList[i])) {
      previewImage = candidateList[i];
      break;
    }
  }
  const isClickable = row.sourceType === "trainer";
  const accountStatusMeta = getAccountStatusMeta(row);
  const handleMouseEnter = () => {
    if (isClickable && typeof onRowHover === "function") {
      onRowHover(row);
    }
  };

  return (
    <div
      className="group grid items-center border-b border-gray-100 bg-white transition-all duration-300 hover:bg-indigo-50/30"
      role="row"
      aria-rowindex={index + 1}
      aria-label={row.displayName}
      tabIndex={isClickable ? 0 : -1}
      onMouseEnter={handleMouseEnter}
      onKeyDown={(event) => {
        if (isClickable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onRowClick(row);
        }
      }}
      style={{ ...style, gridTemplateColumns }}
    >
      <div
        className={`flex h-full items-center pl-6 pr-3 ${
          isClickable ? "cursor-pointer" : ""
        }`}
        onClick={isClickable ? () => onRowClick(row) : undefined}
      >
        <div className="h-12 w-12 shrink-0">
          {row.sourceType === "trainer" && previewImage ? (
            <img
              className="h-12 w-12 rounded-2xl object-cover ring-2 ring-gray-100 shadow-sm transition-all group-hover:ring-indigo-100"
              src={previewImage}
              alt={row.displayName}
              loading="lazy"
              onError={() => {
                // Remember this URL as dead so it is never requested again this
                // session, then advance to the next candidate. When all candidates
                // fail the row quietly falls back to the initials avatar. We do NOT
                // log/toast here to avoid console/UI noise for trainers whose photo
                // simply isn't available.
                markImageUrlFailed(previewImage);
                if (typeof onImageError === 'function') onImageError(row.id, imageLoadErrorIndex + 1);
              }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 font-calibri text-lg font-black uppercase text-white shadow-inner transition-all group-hover:bg-indigo-700">
              {row.displayName.charAt(0)}
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex h-full min-w-0 flex-col justify-center px-3 ${
          isClickable ? "cursor-pointer" : ""
        }`}
        onClick={isClickable ? () => onRowClick(row) : undefined}
      >
        <span className="truncate font-calibri text-[14px] font-bold uppercase tracking-tight text-gray-800 transition-colors group-hover:text-indigo-700">
          {row.displayName}
        </span>
        <span className="mt-1 truncate text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {row.displayReference}
        </span>
        <div className="mt-2 flex items-center text-sm font-medium text-gray-500">
          <MapPinIcon className="mr-1.5 h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate">{row.displayCity}</span>
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-col justify-center px-3">
        <div className="flex items-center font-calibri text-sm font-medium text-gray-600">
          <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate">{row.displayEmail}</span>
        </div>
        <span className="mt-2 inline-flex w-max rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
          {row.displayRole}
        </span>
      </div>

      {showStatusColumns ? (
        <div className="flex h-full flex-col justify-center px-3">
          <div className="flex flex-col gap-2">
            <span
              className={`inline-flex w-max items-center rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </span>
            {accountStatusMeta ? (
              <span
                className={`inline-flex w-max items-center rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${accountStatusMeta.className}`}
              >
                {accountStatusMeta.label}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {showStatusColumns ? (
        <div className="flex h-full items-center justify-end px-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {renderPrimaryAction(row)}
            {renderManagementButtons(row)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

function TrainerListVirtualizedTable({
  rows,
  showStatusColumns,
  imageLoadError,
  onImageError,
  onRowClick,
  onRowHover,
  renderPrimaryAction,
  renderManagementButtons,
  getAccountStatusMeta,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  totalRowCount = 0,
  loadedRowCount = 0,
}) {
  const table = useReactTable({
    data: rows,
    columns: TABLE_COLUMNS,
    getRowId: (row, index) =>
      String(row?.id || row?._id || `trainer-row-${index}`),
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const loadTriggerRef = useRef(-1);

  const handleRowsRendered = useCallback(
    ({ stopIndex }) => {
      if (!hasNextPage || isFetchingNextPage || typeof onLoadMore !== "function") {
        return;
      }

      const triggerIndex = Math.max(
        0,
        tableRows.length - 1 - LOAD_MORE_TRIGGER_OFFSET,
      );

      if (stopIndex < triggerIndex) {
        return;
      }

      if (loadTriggerRef.current === tableRows.length) {
        return;
      }

      loadTriggerRef.current = tableRows.length;
      onLoadMore();
    },
    [hasNextPage, isFetchingNextPage, onLoadMore, tableRows.length],
  );

  const minWidthClassName = showStatusColumns ? "min-w-[1120px]" : "min-w-[760px]";
  const gridTemplateColumns = showStatusColumns
    ? FULL_GRID_TEMPLATE
    : COMPACT_GRID_TEMPLATE;
  const virtualRowCount = tableRows.length + (hasNextPage ? 1 : 0);
  const listHeight = Math.min(
    MAX_TABLE_HEIGHT,
    Math.max(VIRTUAL_ROW_HEIGHT, virtualRowCount * VIRTUAL_ROW_HEIGHT),
  );

  const rowProps = useMemo(
    () => ({
      rows: tableRows,
      showStatusColumns,
      imageLoadError,
      onImageError,
      onRowClick,
      onRowHover,
      renderPrimaryAction,
      renderManagementButtons,
      getAccountStatusMeta,
      hasNextPage,
      isFetchingNextPage,
    }),
    [
      tableRows,
      showStatusColumns,
      imageLoadError,
      onImageError,
      onRowClick,
      onRowHover,
      renderPrimaryAction,
      renderManagementButtons,
      getAccountStatusMeta,
      hasNextPage,
      isFetchingNextPage,
    ],
  );

  if (tableRows.length === 0) {
    return (
      <div className={minWidthClassName}>
        <div
          className="grid border-b border-gray-200 bg-gray-100"
          style={{ gridTemplateColumns }}
        >
          <div className="py-3 pl-6 pr-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
            Profile
          </div>
          <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
            Trainer
          </div>
          <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
            Email
          </div>
          {showStatusColumns ? (
            <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
              Status
            </div>
          ) : null}
          {showStatusColumns ? (
            <div className="px-6 py-3 text-right font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
              Actions
            </div>
          ) : null}
        </div>

        <div className="py-16 text-center">
          <p className="font-calibri text-sm font-bold text-gray-500">
            No trainers match your current filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={minWidthClassName}>
      <div
        className="grid border-b border-gray-200 bg-gray-100"
        style={{ gridTemplateColumns }}
      >
        <div className="py-3 pl-6 pr-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
          Profile
        </div>
        <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
          Trainer
        </div>
        <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
          Email
        </div>
        {showStatusColumns ? (
          <div className="px-3 py-3 text-left font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
            Status
          </div>
        ) : null}
        {showStatusColumns ? (
          <div className="px-6 py-3 text-right font-calibri text-xs font-bold uppercase tracking-widest text-gray-500">
            Actions
          </div>
        ) : null}
      </div>

      <List
        className="overflow-y-auto"
        style={{ height: listHeight }}
        overscanCount={VIRTUAL_OVERSCAN}
        rowComponent={VirtualizedTrainerRow}
        rowCount={virtualRowCount}
        rowHeight={VIRTUAL_ROW_HEIGHT}
        rowProps={rowProps}
        onRowsRendered={handleRowsRendered}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
        <p className="font-calibri text-xs font-bold uppercase tracking-widest text-gray-400">
          Loaded {loadedRowCount} of {Math.max(totalRowCount, loadedRowCount)} records
        </p>

        {hasNextPage ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        ) : (
          <p className="font-calibri text-[11px] font-bold uppercase tracking-widest text-emerald-600">
            All available rows loaded
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(TrainerListVirtualizedTable);
