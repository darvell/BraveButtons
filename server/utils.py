import requests
import numpy
import datetime
import matplotlib
import matplotlib.pyplot as plt
matplotlib.use('Agg')

def send_hide_request(server_url, system_id):
    payload = {"system_id": system_id}
    try:
        r = requests.post(server_url + r"/heartbeat/hide_system", json=payload)
        print("response to hide request:", r.status_code, r.reason)
    except Exception as e:
        print("error sending hide request")
        print(e)

def send_unhide_request(server_url, system_id):
    payload = {"system_id": system_id}
    try:
        r = requests.post(server_url + r"/heartbeat/unhide_system", json=payload)
        print("response to unhide request:", r.status_code, r.reason)
    except Exception as e:
        print("error sending unhide request")
        print(e)

def send_rename_request(server_url, system_id, name):
    payload = {"system_id": system_id, "system_name": name}
    try:
        r = requests.post(server_url + r"/heartbeat/rename_system", json=payload)
        print("response to rename request:", r.status_code, r.reason)
    except Exception as e:
        print("error sending rename request")
        print(e)

def send_mute_request(server_url, system_id):
    payload = {"system_id": system_id}
    try:
        r = requests.post(server_url + r"/heartbeat/mute_system", json=payload)
        print("response to mute request:", r.status_code, r.reason)
    except Exception as e:
        print("error sending mute request")
        print(e)

def send_unmute_request(server_url, system_id):
    payload = {"system_id": system_id}
    try:
        r = requests.post(server_url + r"/heartbeat/unmute_system", json=payload)
        print("response to unmute request:", r.status_code, r.reason)
    except Exception as e:
        print("error sending unmute request")
        print(e)

def send_heartbeat(server_url, system_id, flic_last_seen_secs):
    payload = {"system_id": system_id, "flic_last_seen_secs": flic_last_seen_secs}
    try:
        r = requests.post(server_url + r"/heartbeat", json = payload)
        print("response to heartbeat:", r.status_code, r.reason)
    except Exception as e:
        print("error sending heartbeat")
        print(e)

def parse_data_from_server_log(log_file_url):
    data = numpy.loadtxt(log_file_url, dtype=str, delimiter=",", encoding="utf8")
    heartbeat_times = {}
    flic_last_seen_values = {}
    #fmt = "%b %d %Y %H:%M:%S"
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
    for i in range(0, len(data)):
        system_id = data[i,1][21:57]
        date_string = data[i,0][:24]
        flic_last_seen_secs = data[i,1][81:]
        try:
            heartbeat_times[system_id].append(datetime.datetime.strptime(date_string, fmt))
        except KeyError:
            heartbeat_times[system_id] = [datetime.datetime.strptime(date_string, fmt)]
        try:
            flic_last_seen_values[system_id].append(int(flic_last_seen_secs))
        except KeyError:
            flic_last_seen_values[system_id] = [int(flic_last_seen_secs)]

    return (heartbeat_times, flic_last_seen_values)

def compute_deltas_from_server_log(log_file_url):
    (heartbeat_times, flic_last_seen_values) = parse_data_from_server_log(log_file_url)
    heartbeat_deltas = {}
    flic_last_seen_deltas = {}
    for system_id in heartbeat_times:
        heartbeat_times_list = heartbeat_times[system_id]
        last_seen_values = flic_last_seen_values[system_id]
        heartbeat_deltas[system_id] = []
        flic_last_seen_deltas[system_id] = []
        for i in range(1, len(heartbeat_times_list)):
            time_delta = heartbeat_times_list[i] - heartbeat_times_list[i-1]
            heartbeat_delta = time_delta.seconds + time_delta.microseconds/1000000
            heartbeat_deltas[system_id].append(heartbeat_delta)
            flic_last_seen_deltas[system_id].append(heartbeat_delta + last_seen_values[i-1] - last_seen_values[i])

    return (heartbeat_deltas, flic_last_seen_deltas)

def plot_deltas_from_server_log(log_file_url):
    (heartbeat_deltas, flic_last_seen_deltas) = compute_deltas_from_server_log(log_file_url)
    plt.gcf().set_size_inches(11, 8)
    plt.gcf().set_dpi(160)
    heartbeat_bins = [0, 10, 20, 30, 40, 50, 60, 70]
    flic_bins = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]

    plt.clf()
    
    number_of_systems = len(heartbeat_deltas.items())
    index = 1
    for system_id, deltas in heartbeat_deltas.items():
        plt.subplot(number_of_systems, 1, index)
        index = index + 1
        plt.xscale("log")
        plt.xlim(1, 2*10**4)
        plt.title("heartbeat deltas for system " + system_id[:10])
        plt.xlabel("time [s]")
        plt.ylabel("count")
        plt.hist(deltas, bins=1000, histtype="step", log=True)

    plt.subplots_adjust(hspace=0.5)
    plt.savefig("heartbeat_deltas")
    plt.clf()

    number_of_systems = len(flic_last_seen_deltas.items())
    index = 1
    for system_id, deltas in flic_last_seen_deltas.items():
        plt.subplot(number_of_systems, 1, index)
        index = index + 1
        plt.xscale("log")
        plt.xlim(1, 2*10**4)
        plt.title("flic deltas for system " + system_id[:10])
        plt.xlabel("time [s]")
        plt.ylabel("count")
        plt.hist(deltas, bins=1000, histtype="step", log=True)

    plt.subplots_adjust(hspace=0.5)
    plt.savefig("flic_deltas")


def plot_flic_time_series_from_server_log(log_file_url):
    (heartbeat_times, flic_last_seen_values) = parse_data_from_server_log(log_file_url)
    plt.gcf().set_size_inches(11, 8)
    plt.gcf().set_dpi(160)

    plt.clf()
    index = 1
    nrows = len(heartbeat_times)

    for system_id in heartbeat_times:
        plt.subplot(nrows, 1, index)
        if index == 1:
            plt.title("flic last seen (time series)")
        plt.yscale("log")
        plt.ylabel("last seen value [s]")
        index = index + 1
        dates = matplotlib.dates.date2num(heartbeat_times[system_id])
        plt.plot_date(dates, flic_last_seen_values[system_id], '.')

    plt.subplots_adjust(hspace=0.4)
    plt.savefig("timeseries")
