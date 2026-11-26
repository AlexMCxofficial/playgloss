// Spectator hosting is a desktop feature. Estimate the relay's room limit from physical RAM.
#[tauri::command]
pub fn quiz_capacity() -> usize {
    if cfg!(any(target_os = "windows", target_os = "macos", target_os = "linux")) {
        estimate(physical_memory())
    } else {
        0
    }
}

fn estimate(bytes: Option<u64>) -> usize {
    // Approximately twelve players per GiB, with a bounded server and a fallback if the OS query fails.
    bytes.map_or(24, |n| (n.saturating_mul(12) / (1024 * 1024 * 1024)).clamp(2, 128) as usize)
}

#[cfg(target_os = "linux")]
fn physical_memory() -> Option<u64> {
    let meminfo = std::fs::read_to_string("/proc/meminfo").ok()?;
    let kb: u64 = meminfo.lines().find_map(|line| line.strip_prefix("MemTotal:"))?
        .split_whitespace().next()?.parse().ok()?;
    kb.checked_mul(1024)
}

#[cfg(target_os = "macos")]
fn physical_memory() -> Option<u64> {
    let output = std::process::Command::new("/usr/sbin/sysctl").args(["-n", "hw.memsize"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    std::str::from_utf8(&output.stdout).ok()?.trim().parse().ok()
}

#[cfg(target_os = "windows")]
fn physical_memory() -> Option<u64> {
    // MEMORYSTATUSEX as defined by Windows. All seven memory counters are 64 bit.
    #[repr(C)]
    struct MemoryStatus {
        length: u32,
        load: u32,
        total_physical: u64,
        other: [u64; 6],
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(status: *mut MemoryStatus) -> i32;
    }
    let mut status = MemoryStatus {
        length: std::mem::size_of::<MemoryStatus>() as u32,
        load: 0,
        total_physical: 0,
        other: [0; 6],
    };
    // SAFETY: Windows receives a writable MEMORYSTATUSEX with the declared size and C layout.
    (unsafe { GlobalMemoryStatusEx(&mut status) } != 0).then_some(status.total_physical)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn physical_memory() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_based_capacity_is_bounded() {
        let gib = 1024 * 1024 * 1024;
        assert_eq!(estimate(None), 24);
        assert_eq!(estimate(Some(gib / 8)), 2);
        assert_eq!(estimate(Some(gib * 4)), 48);
        assert_eq!(estimate(Some(gib * 8)), 96);
        assert_eq!(estimate(Some(gib * 16)), 128);
    }
}
