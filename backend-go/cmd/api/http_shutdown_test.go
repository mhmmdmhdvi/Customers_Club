package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"
)

type acceptFailureListener struct {
	net.Listener
	failure   chan struct{}
	closed    chan struct{}
	closeOnce sync.Once
	accepted  bool
	err       error
}

func (l *acceptFailureListener) Accept() (net.Conn, error) {
	if !l.accepted {
		l.accepted = true
		return l.Listener.Accept()
	}
	select {
	case <-l.failure:
		return nil, l.err
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *acceptFailureListener) Close() error {
	l.closeOnce.Do(func() { close(l.closed) })
	return l.Listener.Close()
}

func TestServeHTTPAcceptFailureDrainsBeforeDependencyCleanup(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	failure := errors.New("permanent accept failure")
	l := &acceptFailureListener{Listener: listener, failure: make(chan struct{}), closed: make(chan struct{}), err: failure}
	entered, release, cleanup := make(chan struct{}), make(chan struct{}), make(chan struct{})
	server := newHTTPServer(listener.Addr().String(), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		select {
		case <-cleanup:
			t.Error("dependency cleanup happened before handler finished")
		default:
		}
		w.Write([]byte("drained"))
	}))
	t.Cleanup(func() { server.Close() })
	done := make(chan error, 1)
	go func() {
		err := serveHTTPListener(context.Background(), server, l)
		// This is the caller's cleanup ordering used by runAPI's deferred pool.Close.
		close(cleanup)
		done <- err
	}()
	response := make(chan error, 1)
	go func() {
		res, err := (&http.Client{Timeout: 3 * time.Second}).Get("http://" + listener.Addr().String())
		if err != nil {
			response <- err
			return
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if string(body) != "drained" {
			response <- errors.New("active response did not finish")
			return
		}
		response <- err
	}()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		close(release)
		t.Fatal("handler did not start")
	}
	close(l.failure)
	select {
	case <-cleanup:
		t.Error("serve returned before active request drained after accept failure")
	case <-time.After(40 * time.Millisecond):
	}
	close(release)
	select {
	case err := <-response:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("response did not finish")
	}
	select {
	case err := <-done:
		if !errors.Is(err, failure) {
			t.Fatalf("original accept error lost: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("serve did not finish cleanup")
	}
}

func TestServeHTTPCancellationDrainsActiveRequest(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	listener.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	entered, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- serveHTTP(ctx, address, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			close(entered)
			select {
			case <-release:
			case <-r.Context().Done():
				t.Error("graceful shutdown canceled active request")
			}
			w.Write([]byte("drained"))
		}))
	}()
	client := &http.Client{Timeout: 3 * time.Second}
	response := make(chan error, 1)
	go func() {
		deadline := time.Now().Add(2 * time.Second)
		for {
			res, err := client.Get("http://" + address)
			if err == nil {
				body, readErr := io.ReadAll(res.Body)
				res.Body.Close()
				if string(body) != "drained" {
					response <- errors.New("request did not drain")
					return
				}
				response <- readErr
				return
			}
			if time.Now().After(deadline) {
				response <- err
				return
			}
			time.Sleep(5 * time.Millisecond)
		}
	}()
	select {
	case <-entered:
	case err := <-done:
		t.Fatalf("server exited early: %v", err)
	case <-time.After(3 * time.Second):
		t.Fatal("server did not accept request")
	}
	cancel()
	select {
	case err := <-done:
		t.Errorf("server returned before active request drained: %v", err)
	case <-time.After(40 * time.Millisecond):
	}
	close(release)
	select {
	case err := <-response:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("response did not finish")
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("shutdown did not finish")
	}
	conn, err := net.DialTimeout("tcp", address, 100*time.Millisecond)
	if err == nil {
		conn.Close()
		t.Fatal("shutdown left listener open")
	}
}

func TestServeHTTPReturnsListenerFailure(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	if err := serveHTTP(context.Background(), l.Addr().String(), http.NotFoundHandler()); err == nil {
		t.Fatal("bind failure lost")
	}
}

func TestServeHTTPDoesNotListenAfterCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := serveHTTP(ctx, "invalid address", http.NotFoundHandler()); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation before binding, got %v", err)
	}
}
