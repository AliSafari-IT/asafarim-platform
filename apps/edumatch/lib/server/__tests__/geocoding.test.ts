import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeAddress, reverseGeocode, haversineDistanceKm } from "../geocoding";

describe("geocodeAddress", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-api-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns null when API key not configured", async () => {
    vi.unstubAllEnvs();
    const result = await geocodeAddress("123 Main St");
    expect(result).toBeNull();
  });

  it("returns geocoded location on success", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "123 Main Street, New York, NY 10001, USA",
            geometry: {
              location: { lat: 40.7128, lng: -74.006 },
              bounds: {
                northeast: { lat: 40.72, lng: -74 },
                southwest: { lat: 40.71, lng: -74.01 },
              },
            },
            place_id: "ChIJ1234567890",
            types: ["street_address"],
          },
        ],
      }),
    } as unknown as Response);

    const result = await geocodeAddress("123 Main St, NY");

    expect(result).not.toBeNull();
    if (result && !("error" in result)) {
      expect(result.location).toEqual({ lat: 40.7128, lng: -74.006 });
      expect(result.formattedAddress).toBe("123 Main Street, New York, NY 10001, USA");
      expect(result.placeId).toBe("ChIJ1234567890");
      expect(result.bounds).toBeDefined();
    }
  });

  it("returns error object on geocoding failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ZERO_RESULTS",
      }),
    } as unknown as Response);

    const result = await geocodeAddress("XYZ123 NonExistent");

    expect(result).toHaveProperty("error");
    if (result && "error" in result) {
      expect(result.error).toContain("ZERO_RESULTS");
    }
  });

  it("handles API error messages", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      json: async () => ({
        status: "REQUEST_DENIED",
        error_message: "Invalid API key",
      }),
    } as unknown as Response);

    const result = await geocodeAddress("123 Main St");

    expect(result).toHaveProperty("error");
  });
});

describe("reverseGeocode", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-api-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns address for valid coordinates", async () => {
    // Mock needs to return ok:true and status OK in json
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            status: "OK",
            results: [
              {
                formatted_address: "123 Main Street, New York, NY",
                place_id: "ChIJ123",
                types: ["street_address"],
              },
            ],
          }),
      } as Response),
    );

    const result = await reverseGeocode(40.7128, -74.006);

    expect(result).not.toBeNull();
    if (result && !("error" in result)) {
      expect(result.formattedAddress).toContain("New York");
    }
  });

  it("returns null without API key", async () => {
    vi.unstubAllEnvs();
    const result = await reverseGeocode(0, 0);
    expect(result).toBeNull();
  });
});

describe("haversineDistanceKm", () => {
  it("calculates correct distance between known points", () => {
    // London to Paris ~ 344 km
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };

    const distance = haversineDistanceKm(london, paris);

    expect(distance).toBeGreaterThan(340);
    expect(distance).toBeLessThan(350);
  });

  it("returns 0 for same point", () => {
    const point = { lat: 40.7128, lng: -74.006 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it("calculates distance for antipodal points", () => {
    // North Pole to South Pole should be ~20015 km (half Earth's circumference)
    const northPole = { lat: 90, lng: 0 };
    const southPole = { lat: -90, lng: 0 };

    const distance = haversineDistanceKm(northPole, southPole);

    expect(distance).toBeGreaterThan(20000);
    expect(distance).toBeLessThan(20100);
  });

  it("handles negative coordinates correctly", () => {
    const sydney = { lat: -33.8688, lng: 151.2093 };
    const melbourne = { lat: -37.8136, lng: 144.9631 };

    const distance = haversineDistanceKm(sydney, melbourne);

    expect(distance).toBeGreaterThan(700);
    expect(distance).toBeLessThan(750);
  });
});
