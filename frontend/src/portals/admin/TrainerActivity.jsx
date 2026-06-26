"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Input,
  Tag,
  Space,
  Typography,
  Card,
  Breadcrumb,
  message,
  DatePicker,
  Button,
} from "antd";
import {
  SearchOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  BankOutlined,
  CalendarOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { List } from "react-window";
import Link from "next/link";
import useDebouncedValue from "@/hooks/useDebouncedValue";
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from "@/shared/config/queryPolicies";
import { mapInBatches, runOnIdle } from "@/shared/lib/mainThread";
import {
  getTrainerActivityQueryOptions,
  listTrainerActivity,
  useTrainerActivityQuery,
} from "@/modules/attendance";

import dayjs from "dayjs";

const getXlsx = async () => import("xlsx");

const getPdfTools = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
};

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const ACTIVITY_PAGE_SIZE = 10;
const ACTIVITY_EXPORT_PAGE_SIZE = 100;
const MAX_ACTIVITY_EXPORT_PAGES = 30;
const ACTIVITY_ROW_HEIGHT = 86;
const ACTIVITY_TABLE_HEIGHT = 560;
// Keep this aligned with ACTIVITY_GRID_TEMPLATE minimum track sizes
// 170 + 220 + 200 + 220 + 130 + 220 + 120 = 1280
const ACTIVITY_TABLE_MIN_WIDTH = 1280;
const ACTIVITY_GRID_TEMPLATE =
  "170px minmax(220px,1.1fr) minmax(200px,1fr) minmax(220px,1fr) 130px minmax(220px,1fr) 120px";

const VirtualizedActivityRow = memo(function VirtualizedActivityRow({
  index,
  style,
  rows,
}) {
  const row = rows[index];
  if (!row) {
    return null;
  }

  return (
    <div
      role="row"
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: ACTIVITY_GRID_TEMPLATE,
        borderBottom: "1px solid #f5f5f5",
        alignItems: "stretch",
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <div
          key={cell.id}
          role="cell"
          style={{
            padding: "12px",
            verticalAlign: "top",
            display: "flex",
            alignItems: "center",
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
});

const pad2 = (value) => String(value).padStart(2, "0");

// Attendance times are stored inconsistently: some rows use a full ISO datetime
// (e.g. "2026-06-19T21:32:06.626Z"), others a plain "HH:MM:SS"/"HH:MM" string,
// and some are missing. Normalise an ISO/Date value into a Date when possible.
const toDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// Seconds since midnight for an ISO datetime or an "HH:MM:SS" string.
const toSecondsOfDay = (value) => {
  const dateValue = toDateTime(value);
  if (dateValue) {
    return (
      dateValue.getHours() * 3600 +
      dateValue.getMinutes() * 60 +
      dateValue.getSeconds()
    );
  }
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
};

// Human-readable "hh:mm AM/PM" regardless of how the time was stored.
const formatActivityTime = (value) => {
  if (!value) return null;
  const dateValue = toDateTime(value);
  if (dateValue) {
    return dateValue.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  const match = String(value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = ((hour + 11) % 12) + 1;
    return `${pad2(hour12)}:${pad2(minute)} ${period}`;
  }
  return String(value);
};

// Check-in falls back to the record creation time (the row is created at
// check-in) so the column isn't blank for legacy rows missing checkInTime.
const resolveCheckInValue = (record = {}) => {
  if (record.checkInTime) return record.checkInTime;
  if (typeof record.checkIn === "string" && record.checkIn) return record.checkIn;
  if (record.createdAt) return record.createdAt;
  return null;
};

const resolveCheckOutValue = (record = {}) =>
  record.checkOutTime || record.checkOutCapturedAt || null;

const getDurationMinutes = (record) => {
  const checkInValue = resolveCheckInValue(record);
  const checkOutValue = resolveCheckOutValue(record);
  if (!checkInValue || !checkOutValue) {
    return null;
  }

  // Prefer absolute datetime difference when both are full timestamps.
  const checkInDate = toDateTime(checkInValue);
  const checkOutDate = toDateTime(checkOutValue);
  if (checkInDate && checkOutDate) {
    const minutes = Math.round(
      (checkOutDate.getTime() - checkInDate.getTime()) / 60000,
    );
    return minutes > 0 ? minutes : null;
  }

  const startedAt = toSecondsOfDay(checkInValue);
  const endedAt = toSecondsOfDay(checkOutValue);
  if (startedAt == null || endedAt == null) {
    return null;
  }
  const minutes = Math.round((endedAt - startedAt) / 60);
  return minutes > 0 ? minutes : null;
};

const getDurationLabel = (record) => {
  const totalMinutes = getDurationMinutes(record);
  if (!Number.isFinite(totalMinutes)) {
    return "In Progress";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const getStatusColor = (status) => {
  if (status === "Present") return "green";
  if (status === "Absent") return "red";
  if (status === "Leave") return "blue";
  if (status === "Late") return "orange";
  return "gold";
};

const SORT_ICONS = {
  asc: " \u2191",
  desc: " \u2193",
};

const buildActivitySearchIndex = (row = {}) =>
  [
    row.trainerId?.userId?.name,
    row.trainerId?.trainerId,
    row.collegeId?.name,
    row.status,
    row.location,
    row.checkInTime,
    row.checkOutTime,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const resolveActivityRowId = (row = {}) => {
  const primaryId = row?._id || row?.id || row?.attendanceId;
  if (primaryId) {
    return String(primaryId);
  }

  return [
    row?.trainerId?._id || row?.trainerId?.id || row?.trainerId?.trainerId || "trainer",
    row?.date || "date",
    row?.checkInTime || "checkin",
    row?.checkOutTime || "checkout",
  ].join(":");
};

const TrainerActivity = () => {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [sorting, setSorting] = useState([{ id: "date", desc: true }]);
  const debouncedSearchText = useDebouncedValue(searchText, 300);

  const normalizedDateRange = useMemo(
    () => ({
      startDate: dateRange?.[0]
        ? dayjs(dateRange[0]).format("YYYY-MM-DD")
        : null,
      endDate: dateRange?.[1] ? dayjs(dateRange[1]).format("YYYY-MM-DD") : null,
    }),
    [dateRange],
  );

  const activityFilters = useMemo(
    () => ({
      searchText: String(debouncedSearchText || "").trim(),
      startDate: normalizedDateRange.startDate || "",
      endDate: normalizedDateRange.endDate || "",
    }),
    [debouncedSearchText, normalizedDateRange.endDate, normalizedDateRange.startDate],
  );

  const activityQuery = useTrainerActivityQuery({
    page,
    limit: ACTIVITY_PAGE_SIZE,
    searchText: activityFilters.searchText,
    startDate: activityFilters.startDate,
    endDate: activityFilters.endDate,
  });

  useEffect(() => {
    if (!activityQuery.error) {
      return;
    }

    console.error("Error fetching activity:", activityQuery.error);
    message.error(activityQuery.error.message || "Error loading activity data");
  }, [activityQuery.error]);

  const data = activityQuery.data?.rows || [];
  const pagination = activityQuery.data?.pagination || {
    page,
    limit: ACTIVITY_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  };
  const loading = activityQuery.isPending;
  const isRefreshing = activityQuery.isFetching && !activityQuery.isPending;

  useEffect(() => {
    if (!pagination?.hasNextPage) {
      return;
    }

    const nextPage = Number(pagination.page || page) + 1;
    queryClient.prefetchQuery(
      getTrainerActivityQueryOptions({
        page: nextPage,
        limit: ACTIVITY_PAGE_SIZE,
        searchText: activityFilters.searchText,
        startDate: activityFilters.startDate,
        endDate: activityFilters.endDate,
      }),
    );
  }, [
    activityFilters.endDate,
    activityFilters.searchText,
    activityFilters.startDate,
    page,
    pagination?.hasNextPage,
    pagination?.page,
    queryClient,
  ]);

  const fetchExportRows = useCallback(async () => {
    return queryClient.fetchQuery({
      queryKey: [
        "trainer-activity-export",
        {
          searchText: String(activityFilters.searchText || "").toLowerCase(),
          startDate: activityFilters.startDate,
          endDate: activityFilters.endDate,
        },
      ],
      staleTime: QUERY_STALE_TIMES.DETAIL,
      gcTime: QUERY_GC_TIMES.SHORT,
      queryFn: async () => {
        const aggregatedRows = [];
        let currentPage = 1;
        let hasNextPage = true;

        while (hasNextPage && currentPage <= MAX_ACTIVITY_EXPORT_PAGES) {
          const pagePayload = await listTrainerActivity({
            page: currentPage,
            limit: ACTIVITY_EXPORT_PAGE_SIZE,
            searchText: activityFilters.searchText,
            startDate: activityFilters.startDate,
            endDate: activityFilters.endDate,
          });
          aggregatedRows.push(...(pagePayload?.rows || []));
          hasNextPage = Boolean(pagePayload?.pagination?.hasNextPage);
          currentPage += 1;
        }

        return aggregatedRows;
      },
    });
  }, [
    activityFilters.endDate,
    activityFilters.searchText,
    activityFilters.startDate,
    queryClient,
  ]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const exportRows = await fetchExportRows();
      const XLSX = await getXlsx();
      const exportData = await mapInBatches(
        exportRows,
        (item) => ({
          Date: item.date ? dayjs(item.date).format("DD MMM YYYY") : "-",
          "Trainer Name": item.trainerId?.userId?.name || "Unknown",
          "Trainer ID": item.trainerId?.trainerId || "-",
          "College Name": item.collegeId?.name || "-",
          "Check-In": formatActivityTime(resolveCheckInValue(item)) || "-",
          "Check-Out": formatActivityTime(resolveCheckOutValue(item)) || "-",
          Status: item.status || "-",
          Location:
            item.location || (item.latitude ? `${item.latitude}, ${item.longitude}` : "-"),
        }),
        { batchSize: 300 },
      );

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Trainer Activity");
      await new Promise((resolve) => {
        runOnIdle(() => {
          XLSX.writeFile(workbook, `Trainer_Activity_${dayjs().format("YYYY-MM-DD")}.xlsx`);
          resolve();
        }, 1500);
      });
      message.success("Excel exported successfully");
    } catch (error) {
      console.error("Excel Export Error:", error);
      message.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      const exportRows = await fetchExportRows();
      const { jsPDF, autoTable } = await getPdfTools();
      const doc = new jsPDF("l", "mm", "a4");
      const tableColumn = [
        "Date",
        "Trainer",
        "College",
        "Check-In",
        "Check-Out",
        "Status",
        "Location",
      ];
      const tableRows = await mapInBatches(
        exportRows,
        (item) => [
          item.date ? dayjs(item.date).format("DD MMM YYYY") : "-",
          item.trainerId?.userId?.name || "Unknown",
          item.collegeId?.name || "-",
          formatActivityTime(resolveCheckInValue(item)) || "-",
          formatActivityTime(resolveCheckOutValue(item)) || "-",
          item.status || "-",
          item.location || (item.latitude ? `${item.latitude}, ${item.longitude}` : "-"),
        ],
        { batchSize: 300 },
      );

      doc.text("Trainer Activity Report", 14, 15);
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        theme: "striped",
        headStyles: { fillColor: [24, 144, 255] },
      });

      await new Promise((resolve) => {
        runOnIdle(() => {
          doc.save(`Trainer_Activity_${dayjs().format("YYYY-MM-DD")}.pdf`);
          resolve();
        }, 1500);
      });
      message.success("PDF exported successfully");
    } catch (error) {
      console.error("PDF Export Error:", error);
      message.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleDateRangeChange = useCallback((values) => {
    setDateRange(values);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((event) => {
    setSearchText(event.target.value);
    setPage(1);
  }, []);

  const columns = useMemo(
    () => [
      {
        id: "date",
        accessorFn: (row) => (row.date ? dayjs(row.date).valueOf() : 0),
        header: "Date",
        cell: ({ row }) => (
          <Space>
            <CalendarOutlined style={{ color: "#8c8c8c" }} />
            <Text>{row.original.date ? dayjs(row.original.date).format("DD MMM YYYY") : "-"}</Text>
          </Space>
        ),
      },
      {
        id: "trainer",
        accessorFn: (row) => row.trainerId?.userId?.name || "Unknown",
        header: "Trainer",
        cell: ({ row }) => (
          <Space orientation="vertical" size={0}>
            <Text strong>{row.original.trainerId?.userId?.name || "Unknown"}</Text>
            <Text type="secondary" style={{ fontSize: "12px" }}>
              ID: {row.original.trainerId?.trainerId || "-"}
            </Text>
          </Space>
        ),
      },
      {
        id: "college",
        accessorFn: (row) => row.collegeId?.name || "",
        header: "College Name",
        cell: ({ row }) => (
          <Space>
            <BankOutlined style={{ color: "#1890ff" }} />
            <Text>{row.original.collegeId?.name || "-"}</Text>
          </Space>
        ),
      },
      {
        id: "times",
        accessorFn: (row) => resolveCheckInValue(row) || "",
        header: "Today's Check-In & Out",
        cell: ({ row }) => {
          const checkInLabel = formatActivityTime(resolveCheckInValue(row.original));
          const checkOutLabel = formatActivityTime(resolveCheckOutValue(row.original));
          return (
            <Space orientation="vertical" size={2}>
              <Tag color="cyan">
                <Space>
                  <ClockCircleOutlined />
                  In: {checkInLabel || "-"}
                </Space>
              </Tag>
              {checkOutLabel ? (
                <Tag color="blue">
                  <Space>
                    <ClockCircleOutlined />
                    Out: {checkOutLabel}
                  </Space>
                </Tag>
              ) : null}
            </Space>
          );
        },
      },
      {
        id: "duration",
        accessorFn: (row) => getDurationMinutes(row) || -1,
        header: "Time Logs",
        cell: ({ row }) => {
          const label = getDurationLabel(row.original);
          if (label === "In Progress") {
            return <Text type="secondary">In Progress</Text>;
          }

          return <Tag color="geekblue">{label}</Tag>;
        },
      },
      {
        id: "location",
        accessorFn: (row) =>
          row.location || (row.latitude ? `${row.latitude}, ${row.longitude}` : ""),
        header: "Location",
        cell: ({ row }) => (
          <Space>
            <EnvironmentOutlined style={{ color: "#ff4d4f" }} />
            <Text ellipsis={{ tooltip: row.original.location }}>
              {row.original.location ||
                (row.original.latitude
                  ? `${row.original.latitude}, ${row.original.longitude}`
                  : "-")}
            </Text>
          </Space>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => row.status || "",
        header: "Status",
        cell: ({ row }) => (
          <Tag color={getStatusColor(row.original.status)}>{row.original.status || "-"}</Tag>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => resolveActivityRowId(row),
    state: {
      sorting,
      globalFilter: String(activityFilters.searchText || "").trim().toLowerCase(),
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return buildActivitySearchIndex(row.original).includes(String(filterValue).toLowerCase());
    },
  });
  const tableRows = table.getRowModel().rows;
  const virtualListHeight = Math.min(
    ACTIVITY_TABLE_HEIGHT,
    Math.max(ACTIVITY_ROW_HEIGHT, tableRows.length * ACTIVITY_ROW_HEIGHT),
  );

  const canGoPrevious = pagination.page > 1;
  const canGoNext = pagination.page < Math.max(1, pagination.totalPages);

  return (
    <div style={{ padding: "24px" }}>
      <Breadcrumb
        style={{ marginBottom: "16px" }}
        items={[
          { title: <Link href="/dashboard">Home</Link> },
          { title: "Trainer Activity" },
        ]}
      />

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Trainer Activity Logs
            </Title>
            {isRefreshing ? (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                Refreshing data...
              </Text>
            ) : null}
          </div>

          <Space size="middle" style={{ flexWrap: "wrap" }}>
            <Space>
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportExcel}
                disabled={loading || exporting || pagination.total === 0}
                loading={exporting}
              >
                Excel
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={handleExportPDF}
                disabled={loading || exporting || pagination.total === 0}
                loading={exporting}
                danger
              >
                PDF
              </Button>
            </Space>
            <RangePicker onChange={handleDateRangeChange} style={{ width: 280 }} />
            <Input
              placeholder="Search trainer or college..."
              prefix={<SearchOutlined />}
              style={{ width: 250 }}
              value={searchText}
              onChange={handleSearchChange}
              allowClear
            />
          </Space>
        </div>

        <div style={{ overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: ACTIVITY_TABLE_MIN_WIDTH }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                key={headerGroup.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: ACTIVITY_GRID_TEMPLATE,
                  borderBottom: "1px solid #f0f0f0",
                  background: "#fafafa",
                }}
              >
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  const sortHint =
                    isSorted === "asc"
                      ? SORT_ICONS.asc
                      : isSorted === "desc"
                        ? SORT_ICONS.desc
                        : "";

                  return (
                    <div
                      key={header.id}
                      role="columnheader"
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "#475569",
                        cursor: header.column.getCanSort() ? "pointer" : "default",
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortHint}
                    </div>
                  );
                })}
              </div>
            ))}

            {loading && data.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                Loading activity records...
              </div>
            ) : null}

            {!loading && tableRows.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                No activity records found for the selected filters.
              </div>
            ) : null}

            {!loading && tableRows.length > 0 ? (
              <List
                rowComponent={VirtualizedActivityRow}
                rowCount={tableRows.length}
                rowHeight={ACTIVITY_ROW_HEIGHT}
                rowProps={{ rows: tableRows }}
                style={{ height: virtualListHeight, width: "100%", overflowX: "hidden" }}
                overscanCount={6}
              />
            ) : null}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Showing page {pagination.page} of {Math.max(1, pagination.totalPages)} ({pagination.total} total)
          </Text>

          <Space>
            <Button disabled={!canGoPrevious} onClick={() => setPage((previous) => previous - 1)}>
              Prev
            </Button>
            <Button disabled={!canGoNext} onClick={() => setPage((previous) => previous + 1)}>
              Next
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default TrainerActivity;
