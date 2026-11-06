import { describe, expect, it } from "vitest";
import { boardDateLabel, boardSummary, buildBoardLanes, compareBoardCards, filterBoardCards, laneSubtitle, normalizeJobsLayout, stageLaneKey, STAGE_LANES, toBoardCard, type BoardJobInput } from "@/lib/jobs/wip-board";

const NOW = new Date("2026-11-06T09:00:00Z");

function job(over: Partial<BoardJobInput> = {}): BoardJobInput {
  return {
    id: "j1", href: "/jobs/j1", jobNumber: "10482", draftNumber: null, customerName: "Kalahari Haulage", component: "Final drive",
    machineMake: "CAT", machineModel: "777D", status: "STRIPPING", type: "REPAIR", returnedUnrepaired: false, breakdown: false, pex: false,
    itemStatuses: [], people: [], mechanicEtaDate: null, etaDate: null, ...over,
  };
}

describe("layout choice", () => {
  it("is the table unless the board was chosen", () => {
    expect(normalizeJobsLayout(undefined)).toBe("table");
    expect(normalizeJobsLayout("nonsense")).toBe("table");
    expect(normalizeJobsLayout("board")).toBe("board");
    expect(normalizeJobsLayout("table")).toBe("table");
  });
});

describe("stage lanes", () => {
  it("puts every workshop status in the lane the user approved", () => {
    expect(stageLaneKey("TO_BE_RECEIVED")).toBe("receiving");
    expect(stageLaneKey("TO_STRIP")).toBe("receiving");
    expect(stageLaneKey("QUOTE_IN_PROGRESS")).toBe("quote");
    expect(stageLaneKey("AWAITING_GO_AHEAD")).toBe("quote");
    for (const s of ["STRIPPING", "ASSEMBLY", "TESTING", "TO_PAINT_WRAP"]) expect(stageLaneKey(s)).toBe("workshop");
    expect(stageLaneKey("AWAIT_OUTWORK")).toBe("parts");
    expect(stageLaneKey("WAITING_FOR_PARTS")).toBe("parts");
    expect(stageLaneKey("TO_BE_DELIVERED")).toBe("delivery");
    expect(stageLaneKey("DELIVERED_AWAITING_PAYMENT")).toBe("delivery");
    expect(stageLaneKey("TO_ATTEND")).toBe("field");
    expect(stageLaneKey("COMPLETE")).toBe("completed");
  });

  it("covers the Engineering statuses and falls back to Other for an unknown one", () => {
    expect(stageLaneKey("AWAIT_ASSESSMENT")).toBe("receiving");
    expect(stageLaneKey("WORK_IN_PROGRESS")).toBe("workshop");
    expect(stageLaneKey("QC_CONTROL")).toBe("workshop");
    expect(stageLaneKey("SOMETHING_NEW")).toBe("other");
  });

  it("always shows the five core lanes, and the extra lanes only when a job is in them", () => {
    const empty = buildBoardLanes([], "stage");
    expect(empty.map((l) => l.name)).toEqual(["Receiving", "Quote and approval", "Workshop", "Parts and outwork", "Delivery"]);
    const withField = buildBoardLanes([toBoardCard(job({ status: "ON_ROUTE" }), null, NOW)], "stage");
    expect(withField.map((l) => l.key)).toContain("field");
    const withOther = buildBoardLanes([toBoardCard(job({ status: "SOMETHING_NEW" }), null, NOW)], "stage");
    expect(withOther.map((l) => l.key)).toContain("other");
  });

  it("names the statuses under each lane for the company's build", () => {
    const quote = STAGE_LANES.find((l) => l.key === "quote")!;
    expect(laneSubtitle(quote)).toBe("Quote in progress · Await go ahead");
    expect(laneSubtitle(quote, "ENGINEERING")).toBe("Quoting · Await go ahead");
    const receiving = STAGE_LANES.find((l) => l.key === "receiving")!;
    expect(laneSubtitle(receiving)).toBe("To be received/collected · To strip");
    expect(laneSubtitle(receiving, "ENGINEERING")).toBe("To be received/collected · Await assessment");
  });
});

describe("cards", () => {
  it("shows the job number (or the draft number), customer, and component with machine", () => {
    const card = toBoardCard(job(), null, NOW);
    expect(card.num).toBe("10482");
    expect(card.what).toBe("Final drive · CAT 777D");
    expect(toBoardCard(job({ jobNumber: null, draftNumber: "D-7" }), null, NOW).num).toBe("D-7");
    expect(toBoardCard(job({ component: null, machineMake: null, machineModel: null }), null, NOW).what).toBe("—");
  });

  it("keeps the customer out when the viewer may not see customers", () => {
    expect(toBoardCard(job({ customerName: null }), null, NOW).customer).toBeNull();
  });

  it("marks a job late the way the ETA Overdue column does (Mechanic ETA, not finished)", () => {
    const late = toBoardCard(job({ mechanicEtaDate: "2026-11-02T00:00:00Z" }), null, NOW);
    expect(late.lateDays).toBe(4);
    expect(late.etaLabel).toBe("02 Nov");
    expect(toBoardCard(job({ mechanicEtaDate: "2026-11-09T00:00:00Z" }), null, NOW).lateDays).toBeNull();
    expect(toBoardCard(job({ mechanicEtaDate: "2026-11-02T00:00:00Z", status: "TO_BE_DELIVERED" }), null, NOW).lateDays).toBeNull();
  });

  it("shows the customer ETA when there is no Mechanic ETA, but never marks it late", () => {
    const card = toBoardCard(job({ etaDate: "2026-10-20T00:00:00Z" }), null, NOW);
    expect(card.etaLabel).toBe("20 Oct");
    expect(card.lateDays).toBeNull();
  });

  it("counts items, flags mixed steps, and lists each person once", () => {
    const multi = toBoardCard(job({ itemStatuses: ["STRIPPING", "ASSEMBLY", "STRIPPING"], people: ["Thabo Nkosi", null, "Thabo Nkosi", "Johan Meyer"] }), null, NOW);
    expect(multi.itemCount).toBe(3);
    expect(multi.mixed).toBe(true);
    expect(multi.people).toEqual(["Thabo Nkosi", "Johan Meyer"]);
    const single = toBoardCard(job({ itemStatuses: ["STRIPPING"] }), null, NOW);
    expect(single.itemCount).toBe(0);
    expect(single.mixed).toBe(false);
    expect(toBoardCard(job({ itemStatuses: ["STRIPPING", "STRIPPING"] }), null, NOW).mixed).toBe(false);
  });

  it("writes dates on the UTC day, the same on the server and in the browser", () => {
    expect(boardDateLabel("2026-11-03T23:30:00Z")).toBe("03 Nov");
    expect(boardDateLabel(null)).toBeNull();
    expect(boardDateLabel("not a date")).toBeNull();
  });
});

describe("order inside a lane", () => {
  it("puts the most late first, then the nearest ETA, jobs with no ETA last", () => {
    const a = toBoardCard(job({ id: "a", jobNumber: "1", mechanicEtaDate: "2026-11-03T00:00:00Z" }), null, NOW); // 3 late
    const b = toBoardCard(job({ id: "b", jobNumber: "2", mechanicEtaDate: "2026-10-30T00:00:00Z" }), null, NOW); // 7 late
    const c = toBoardCard(job({ id: "c", jobNumber: "3", mechanicEtaDate: "2026-11-12T00:00:00Z" }), null, NOW);
    const d = toBoardCard(job({ id: "d", jobNumber: "4", mechanicEtaDate: "2026-11-09T00:00:00Z" }), null, NOW);
    const e = toBoardCard(job({ id: "e", jobNumber: "5" }), null, NOW);
    expect([a, b, c, d, e].sort(compareBoardCards).map((x) => x.id)).toEqual(["b", "a", "d", "c", "e"]);
  });

  it("breaks a tie with the newest job number", () => {
    const x = toBoardCard(job({ id: "x", jobNumber: "10479" }), null, NOW);
    const y = toBoardCard(job({ id: "y", jobNumber: "10481" }), null, NOW);
    expect([x, y].sort(compareBoardCards).map((c) => c.id)).toEqual(["y", "x"]);
  });
});

describe("filters and summary", () => {
  const cards = [
    toBoardCard(job({ id: "1", status: "STRIPPING", mechanicEtaDate: "2026-11-01T00:00:00Z", people: ["Thabo Nkosi"] }), null, NOW),
    toBoardCard(job({ id: "2", status: "ASSEMBLY", type: "WARRANTY", people: ["Johan Meyer"] }), null, NOW),
    toBoardCard(job({ id: "3", status: "COMPLETE", mechanicEtaDate: "2026-10-01T00:00:00Z" }), null, NOW),
  ];

  it("hides completed jobs unless asked", () => {
    expect(filterBoardCards(cards, {}).map((c) => c.id)).toEqual(["1", "2"]);
    expect(filterBoardCards(cards, { showCompleted: true }).map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("filters by late, person and job type", () => {
    expect(filterBoardCards(cards, { lateOnly: true }).map((c) => c.id)).toEqual(["1"]);
    expect(filterBoardCards(cards, { person: "Johan Meyer" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterBoardCards(cards, { type: "WARRANTY" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("counts active and late jobs, leaving completed ones out", () => {
    expect(boardSummary(cards)).toEqual({ active: 2, late: 1 });
  });

  it("counts jobs per lane after filtering", () => {
    const lanes = buildBoardLanes(filterBoardCards(cards, {}), "stage");
    expect(lanes.find((l) => l.key === "workshop")!.cards.map((c) => c.id)).toEqual(["1", "2"]);
    expect(lanes.find((l) => l.key === "delivery")!.cards).toHaveLength(0);
  });
});

describe("every status lanes", () => {
  it("makes one lane per step in the flow, in order, with the build's wording", () => {
    const lanes = buildBoardLanes([], "status", "ENGINEERING");
    expect(lanes.map((l) => l.name)).toEqual(["To be received/collected", "Await assessment", "Quoting", "Await go ahead", "Await outwork", "Work in progress", "QC control", "To be delivered", "Delivered / Await payment"]);
  });

  it("adds a lane for a status outside the flow only when a job is in it", () => {
    const lanes = buildBoardLanes([toBoardCard(job({ status: "WAITING_FOR_PARTS" }), null, NOW)], "status");
    expect(lanes.map((l) => l.key)).toContain("WAITING_FOR_PARTS");
    expect(buildBoardLanes([], "status").map((l) => l.key)).not.toContain("WAITING_FOR_PARTS");
  });
});

describe("board preferences cookie", () => {
  it("round-trips the lane style and show-completed choice, and falls back to the defaults", async () => {
    const { parseBoardPrefs, serializeBoardPrefs } = await import("@/lib/jobs/wip-board");
    expect(parseBoardPrefs(undefined)).toEqual({ mode: "stage", showCompleted: false });
    expect(parseBoardPrefs("garbage")).toEqual({ mode: "stage", showCompleted: false });
    expect(parseBoardPrefs(serializeBoardPrefs({ mode: "status", showCompleted: true }))).toEqual({ mode: "status", showCompleted: true });
    expect(serializeBoardPrefs({ mode: "stage", showCompleted: false })).toBe("stage.0");
  });
});
